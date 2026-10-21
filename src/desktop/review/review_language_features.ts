import * as vscode from 'vscode';
import path from 'path';
import { REVIEW_URI_SCHEME } from '../constants';
import { fromReviewUri, isEmptyFileUri, toReviewUri } from './review_uri';
import { log } from '../../common/log';
import { getNewLineForOldUnchangedLine } from '../git/diff_line_count';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { getCachedMrForReviewUri } from './commits/commit_versions';
import { findFileInDiffs } from '../utils/find_file_in_diffs';

type LocationResult = vscode.Location | vscode.LocationLink;

export interface LocalCounterpart {
  /** Results in the local file show here: the review document itself, or the head document for the base side */
  reviewUri: vscode.Uri;
  localUri: vscode.Uri;
  /** The local position is this many lines below the requested one */
  lineOffset: number;
}

interface HeadLine {
  headUri: vscode.Uri;
  lineOffset: number;
}

interface ContentCheck {
  reviewVersion: number;
  localVersion: number;
  matches: boolean;
}

const getLocalUri = (reviewUri: vscode.Uri): vscode.Uri | undefined => {
  try {
    if (isEmptyFileUri(reviewUri)) return undefined;
    const { repositoryRoot, path: filePath } = fromReviewUri(reviewUri);
    if (!repositoryRoot || !filePath) return undefined;
    return vscode.Uri.file(path.join(repositoryRoot, filePath));
  } catch (e) {
    log.debug(`Review code navigation: can't parse review URI ${reviewUri.toString()}`, e);
    return undefined;
  }
};

// line by line, so that CRLF and LF line endings (e.g. from `core.autocrlf`) are equal
const haveSameLines = (a: vscode.TextDocument, b: vscode.TextDocument): boolean => {
  const aLines = a.getText().split(/\r?\n/);
  const bLines = b.getText().split(/\r?\n/);
  return aLines.length === bLines.length && aLines.every((line, i) => line === bLines[i]);
};

const isSameFile = (a: vscode.Uri, b: vscode.Uri): boolean =>
  a.toString() === b.toString() ||
  (a.scheme === b.scheme && path.normalize(a.fsPath) === path.normalize(b.fsPath));

const isLocationLink = (location: LocationResult): location is vscode.LocationLink =>
  'targetUri' in location;

/** Results in the local file are moved to the review document, so that the user stays in the diff. */
const mapLocations = <T extends LocationResult>(
  locations: T[],
  { reviewUri, localUri }: LocalCounterpart,
): T[] | undefined => {
  if (locations.length === 0) return undefined;
  return locations.map(location => {
    if (isLocationLink(location)) {
      return isSameFile(location.targetUri, localUri)
        ? ({ ...location, targetUri: reviewUri } as T)
        : location;
    }
    return isSameFile(location.uri, localUri)
      ? (new vscode.Location(reviewUri, location.range) as T)
      : location;
  });
};

const shiftRange = (range: vscode.Range, lines: number) =>
  new vscode.Range(
    range.start.line + lines,
    range.start.character,
    range.end.line + lines,
    range.end.character,
  );

const mergeHovers = (
  hovers: vscode.Hover[],
  { lineOffset }: LocalCounterpart,
): vscode.Hover | undefined => {
  const contents = hovers.flatMap(h => h.contents);
  if (contents.length === 0) return undefined;
  const range = hovers.find(h => h.range)?.range;
  return new vscode.Hover(contents, range && lineOffset ? shiftRange(range, -lineOffset) : range);
};

/**
 * The base side of a diff is older than the local file, but its unchanged lines are
 * also in the head version. Returns the head document and the line that matches `line`.
 */
const findHeadLine = (baseUri: vscode.Uri, line: number): HeadLine | undefined => {
  const params = fromReviewUri(baseUri);
  const project = gitlabProjectRepository.getSelectedOrDefaultForRepository(params.repositoryRoot);
  const cachedMr = project && getCachedMrForReviewUri(params, project);
  if (!cachedMr || params.commit !== cachedMr.mrVersion.base_commit_sha) return undefined;
  const { mrVersion } = cachedMr;
  const diff = findFileInDiffs(mrVersion.diffs, { oldPath: params.path });
  if (!diff || diff.deleted_file) return undefined;
  const headLine = getNewLineForOldUnchangedLine(mrVersion, diff.old_path, line + 1);
  if (headLine === undefined) return undefined;
  return {
    headUri: toReviewUri({
      ...params,
      path: diff.new_path,
      exists: true,
      commit: mrVersion.head_commit_sha,
    }),
    lineOffset: headLine - 1 - line,
  };
};

/**
 * Review documents (`gl-review:` URIs) get no code navigation from most language extensions,
 * they only support `file:` documents. When the review document has the same content as
 * the file in the local checkout, the positions in both documents are the same, so we can
 * forward the request to the local file and map the results back to the review document.
 * On the base side, a request on an unchanged line goes through the head version instead.
 *
 * When the content differs, we answer nothing, a missing result is better than a jump to a wrong line.
 */
export class ReviewLanguageFeatures
  implements
    vscode.DefinitionProvider,
    vscode.TypeDefinitionProvider,
    vscode.ImplementationProvider,
    vscode.ReferenceProvider,
    vscode.HoverProvider,
    vscode.Disposable
{
  #contentChecks = new Map<string, ContentCheck>();

  /** Requests we are asking all providers about; ours doesn't answer those. */
  #probes = new Map<string, number>();

  #subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.#subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(document =>
        this.#contentChecks.delete(document.uri.toString()),
      ),
    );
  }

  #contentMatches = (document: vscode.TextDocument, localDocument: vscode.TextDocument) => {
    const key = document.uri.toString();
    const cached = this.#contentChecks.get(key);
    if (
      cached &&
      cached.reviewVersion === document.version &&
      cached.localVersion === localDocument.version
    ) {
      return cached.matches;
    }
    const matches = haveSameLines(document, localDocument);
    if (!matches) {
      log.debug(
        `Review code navigation: ${localDocument.uri.fsPath} differs from the MR version, navigation is disabled for it.`,
      );
    }
    this.#contentChecks.set(key, {
      reviewVersion: document.version,
      localVersion: localDocument.version,
      matches,
    });
    return matches;
  };

  /** Returns the local file for the review document if it exists and has the same content. */
  #findIdenticalLocalFile = async (
    document: vscode.TextDocument,
  ): Promise<vscode.Uri | undefined> => {
    const localUri = getLocalUri(document.uri);
    if (!localUri) return undefined;

    let localDocument: vscode.TextDocument;
    try {
      localDocument = await vscode.workspace.openTextDocument(localUri);
    } catch (e) {
      log.debug(`Review code navigation: can't open ${localUri.fsPath}`, e);
      return undefined;
    }

    return this.#contentMatches(document, localDocument) ? localDocument.uri : undefined;
  };

  #findHeadCounterpart = async (
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<LocalCounterpart | undefined> => {
    let headLine: HeadLine | undefined;
    let headDocument: vscode.TextDocument;
    try {
      headLine = findHeadLine(document.uri, position.line);
      if (!headLine) return undefined;
      headDocument = await vscode.workspace.openTextDocument(headLine.headUri);
    } catch (e) {
      log.debug(`Review code navigation: can't map ${document.uri.toString()} to the head`, e);
      return undefined;
    }
    const localUri = await this.#findIdenticalLocalFile(headDocument);
    if (!localUri) return undefined;
    return { reviewUri: headLine.headUri, localUri, lineOffset: headLine.lineOffset };
  };

  /**
   * Returns the local file that can answer for `position` in the review document: the file
   * with the same content, or, for an unchanged line on the base side, the file with the same
   * content as the head version.
   */
  findLocalCounterpart = async (
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<LocalCounterpart | undefined> => {
    if (document.uri.scheme !== REVIEW_URI_SCHEME) return undefined;
    const localUri = await this.#findIdenticalLocalFile(document);
    if (localUri) return { reviewUri: document.uri, localUri, lineOffset: 0 };
    return this.#findHeadCounterpart(document, position);
  };

  /**
   * Some language extensions (e.g. the built-in TypeScript) already answer for review documents.
   * We ask all providers for the review document, while ours stays silent, and step in only when
   * nobody else answered. Otherwise every result would show twice.
   */
  #othersAnswer = async (
    command: string,
    position: vscode.Position,
    reviewUri: vscode.Uri,
  ): Promise<boolean> => {
    const key = `${command} ${reviewUri.toString()}`;
    this.#probes.set(key, (this.#probes.get(key) ?? 0) + 1);
    try {
      const results = await vscode.commands.executeCommand<unknown[] | undefined>(
        command,
        reviewUri,
        position,
      );
      return Boolean(results?.length);
    } finally {
      const count = (this.#probes.get(key) ?? 1) - 1;
      if (count > 0) this.#probes.set(key, count);
      else this.#probes.delete(key);
    }
  };

  #isProbing = (command: string, reviewUri: vscode.Uri) =>
    this.#probes.has(`${command} ${reviewUri.toString()}`);

  #forward = async <R, T>(
    command: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    mapResult: (result: R, counterpart: LocalCounterpart) => T | undefined,
  ): Promise<T | undefined> => {
    if (this.#isProbing(command, document.uri)) return undefined;
    const counterpart = await this.findLocalCounterpart(document, position);
    if (!counterpart || token.isCancellationRequested) return undefined;
    try {
      if (await this.#othersAnswer(command, position, document.uri)) return undefined;
      if (token.isCancellationRequested) return undefined;
      const result = await vscode.commands.executeCommand<R | undefined>(
        command,
        counterpart.localUri,
        new vscode.Position(position.line + counterpart.lineOffset, position.character),
      );
      if (!result || token.isCancellationRequested) return undefined;
      return mapResult(result, counterpart);
    } catch (e) {
      log.debug(`Review code navigation: ${command} failed`, e);
      return undefined;
    }
  };

  #forwardLocations = <T extends LocationResult>(
    command: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ) => this.#forward<T[], T[]>(command, document, position, token, mapLocations);

  // Mapping keeps the kind of every location, so a provider's Location[] or LocationLink[] stays one
  #forwardDefinitions = (
    command: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ) =>
    this.#forwardLocations(command, document, position, token) as Promise<
      vscode.Location[] | vscode.LocationLink[] | undefined
    >;

  provideDefinition = (
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ) => this.#forwardDefinitions('vscode.executeDefinitionProvider', document, position, token);

  provideTypeDefinition = (
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ) => this.#forwardDefinitions('vscode.executeTypeDefinitionProvider', document, position, token);

  provideImplementation = (
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ) => this.#forwardDefinitions('vscode.executeImplementationProvider', document, position, token);

  provideReferences = (
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    token: vscode.CancellationToken,
  ) =>
    this.#forwardLocations<vscode.Location>(
      'vscode.executeReferenceProvider',
      document,
      position,
      token,
    );

  provideHover = (
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ) =>
    this.#forward<vscode.Hover[], vscode.Hover>(
      'vscode.executeHoverProvider',
      document,
      position,
      token,
      mergeHovers,
    );

  dispose = () => {
    this.#subscriptions.forEach(s => s.dispose());
    this.#contentChecks.clear();
  };
}

export const registerReviewLanguageFeatures = (context: vscode.ExtensionContext): void => {
  const selector: vscode.DocumentSelector = { scheme: REVIEW_URI_SCHEME };
  const provider = new ReviewLanguageFeatures();
  context.subscriptions.push(
    provider,
    vscode.languages.registerDefinitionProvider(selector, provider),
    vscode.languages.registerTypeDefinitionProvider(selector, provider),
    vscode.languages.registerImplementationProvider(selector, provider),
    vscode.languages.registerReferenceProvider(selector, provider),
    vscode.languages.registerHoverProvider(selector, provider),
  );
};
