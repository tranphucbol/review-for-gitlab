import * as path from 'path';
import * as vscode from 'vscode';
import { log } from '../../../common/log';
import { CodeHover, CodeLocation, CodePosition, CodeRange, DiffSide } from './messages';

/** Ctrl+hover previews a target in another file only up to this size. */
export const PREVIEW_LIMIT = 256 * 1024;

/** Previews are sent only when the targets are in at most this many other files. */
export const PREVIEW_FILE_LIMIT = 20;

type LocationResult = vscode.Location | vscode.LocationLink;

interface LocalPosition {
  /** the version that the local file equals */
  side: DiffSide;
  position: vscode.Position;
}

const otherSide = (side: DiffSide): DiffSide => (side === 'old' ? 'new' : 'old');

// line by line, so that CRLF and LF line endings are equal
const toLines = (text: string) => text.split(/\r?\n/);

const sameLines = (a: string[], b: string[]) =>
  a.length === b.length && a.every((line, i) => line === b[i]);

const isSameFile = (a: vscode.Uri, b: vscode.Uri) =>
  a.toString() === b.toString() ||
  (a.scheme === b.scheme && path.normalize(a.fsPath) === path.normalize(b.fsPath));

const toCodeRange = (range: vscode.Range): CodeRange => ({
  startLine: range.start.line + 1,
  startColumn: range.start.character + 1,
  endLine: range.end.line + 1,
  endColumn: range.end.character + 1,
});

const toMarkdown = (content: vscode.MarkdownString | vscode.MarkedString): string => {
  if (typeof content === 'string') return content;
  if ('language' in content) return `\`\`\`${content.language}\n${content.value}\n\`\`\``;
  return content.value;
};

/**
 * Finds the position in the local file that matches a position in a pane. The local file
 * answers for a pane only when it has the same lines as that version. When it has the same
 * lines as the other version, it still answers for an unchanged line, through `otherLine`.
 */
export const findLocalPosition = (
  localText: string,
  texts: Record<DiffSide, string>,
  request: CodePosition,
): LocalPosition | undefined => {
  const local = toLines(localText);
  const character = request.column - 1;
  if (sameLines(local, toLines(texts[request.side]))) {
    return { side: request.side, position: new vscode.Position(request.line - 1, character) };
  }
  const other = otherSide(request.side);
  if (request.otherLine !== undefined && sameLines(local, toLines(texts[other]))) {
    return { side: other, position: new vscode.Position(request.otherLine - 1, character) };
  }
  return undefined;
};

/**
 * Code navigation for the side-by-side view. Monaco in the webview knows no language
 * servers, so it asks the host, which asks the language extensions about the local file,
 * like the native review does in `review_language_features.ts`. When the local file has
 * other content, there is no answer: a missing result is better than a jump to a wrong line.
 */
const readPreview = async (uri: vscode.Uri): Promise<string | undefined> => {
  try {
    const text = (await vscode.workspace.openTextDocument(uri)).getText();
    return text.length <= PREVIEW_LIMIT ? text : undefined;
  } catch (e) {
    log.debug(`Side-by-side code navigation: can't preview ${uri.toString()}`, e);
    return undefined;
  }
};

export class LocalCodeNavigation {
  readonly #localUri: vscode.Uri;

  readonly #texts: Record<DiffSide, string>;

  /** the other-file targets of every answer, the only files the webview may open */
  #openable = new Set<string>();

  constructor(localUri: vscode.Uri, texts: Record<DiffSide, string>) {
    this.#localUri = localUri;
    this.#texts = texts;
  }

  async #findLocalPosition(request: CodePosition): Promise<LocalPosition | undefined> {
    try {
      const document = await vscode.workspace.openTextDocument(this.#localUri);
      const local = findLocalPosition(document.getText(), this.#texts, request);
      log.debug(
        `Side-by-side code navigation: ${request.side} ${request.line}:${request.column}` +
          ` (other line ${request.otherLine}) is ${
            local ? `${local.side} ${local.position.line + 1}` : 'not in the local file'
          }`,
      );
      return local;
    } catch (e) {
      log.debug(`Side-by-side code navigation: can't open ${this.#localUri.fsPath}`, e);
      return undefined;
    }
  }

  async #locations(
    command: 'vscode.executeDefinitionProvider' | 'vscode.executeReferenceProvider',
    request: CodePosition,
  ): Promise<CodeLocation[]> {
    const local = await this.#findLocalPosition(request);
    if (!local) return [];
    const results =
      (await vscode.commands.executeCommand<LocationResult[] | undefined>(
        command,
        this.#localUri,
        local.position,
      )) ?? [];
    const otherFiles = [
      ...new Set(
        results
          .map(result => ('targetUri' in result ? result.targetUri : result.uri))
          .filter(uri => !isSameFile(uri, this.#localUri))
          .map(uri => uri.toString()),
      ),
    ];
    const previews = new Map<string, string | undefined>(
      otherFiles.length <= PREVIEW_FILE_LIMIT
        ? await Promise.all(
            otherFiles.map(async uri => [uri, await readPreview(vscode.Uri.parse(uri))] as const),
          )
        : [],
    );
    otherFiles.forEach(uri => this.#openable.add(uri));
    return results.map((result): CodeLocation => {
      const uri = 'targetUri' in result ? result.targetUri : result.uri;
      const range = toCodeRange(
        'targetUri' in result ? result.targetSelectionRange ?? result.targetRange : result.range,
      );
      if (isSameFile(uri, this.#localUri)) return { side: local.side, range };
      const preview = previews.get(uri.toString());
      return { uri: uri.toString(), range, ...(preview === undefined ? {} : { preview }) };
    });
  }

  definitions(request: CodePosition): Promise<CodeLocation[]> {
    return this.#locations('vscode.executeDefinitionProvider', request);
  }

  /** Monaco asks for references when Ctrl/Cmd+click lands on a declaration, and on Shift+F12. */
  references(request: CodePosition): Promise<CodeLocation[]> {
    return this.#locations('vscode.executeReferenceProvider', request);
  }

  async hover(request: CodePosition): Promise<CodeHover | undefined> {
    const local = await this.#findLocalPosition(request);
    if (!local) return undefined;
    const hovers =
      (await vscode.commands.executeCommand<vscode.Hover[] | undefined>(
        'vscode.executeHoverProvider',
        this.#localUri,
        local.position,
      )) ?? [];
    const contents = hovers.flatMap(h => h.contents.map(toMarkdown)).filter(Boolean);
    if (contents.length === 0) return undefined;
    const range = hovers.find(h => h.range)?.range;
    // the hover is on one line, which is `request.line` in the pane, whichever side answered
    const paneRange =
      range && range.start.line === range.end.line
        ? {
            ...toCodeRange(range),
            startLine: request.line,
            endLine: request.line,
          }
        : undefined;
    return { contents, ...(paneRange ? { range: paneRange } : {}) };
  }

  /** Opens a target in another file, in the editor group of the side-by-side view. */
  async open(uri: string, line: number, column: number): Promise<void> {
    if (!this.#openable.has(uri)) {
      log.warn(`Side-by-side code navigation: refusing to open ${uri}, it was not a result.`);
      return;
    }
    const position = new vscode.Position(line - 1, column - 1);
    await vscode.window.showTextDocument(vscode.Uri.parse(uri), {
      selection: new vscode.Range(position, position),
    });
  }
}
