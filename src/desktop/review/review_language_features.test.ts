import * as vscode from 'vscode';
import { ReviewLanguageFeatures, registerReviewLanguageFeatures } from './review_language_features';
import { toReviewUri } from './review_uri';
import { REVIEW_URI_SCHEME } from '../constants';
import { asMock } from '../test_utils/as_mock';
import { Uri } from '../test_utils/uri';
import { diffFile, mr, mrVersion, projectInRepository } from '../test_utils/entities';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { mrCache } from '../gitlab/mr_cache';

jest.mock('../gitlab/gitlab_project_repository');
jest.mock('../gitlab/mr_cache');

const CONTENT = 'export const answer = 42;\nexport const double = () => answer * 2;\n';

const reviewParams = {
  path: '/src/navigation.ts',
  exists: true,
  repositoryRoot: '/repo',
  projectId: 1,
  mrId: 2,
};
const reviewUri = toReviewUri({ ...reviewParams, commit: 'abc' });
const emptyFileUri = toReviewUri({
  path: '/src/navigation.ts',
  exists: false,
  repositoryRoot: '/repo',
  projectId: 1,
  mrId: 2,
});
const localUri = Uri.file('/repo/src/navigation.ts');
const otherUri = Uri.file('/repo/src/other.ts');

const createDocument = (uri: vscode.Uri, text: string, version = 1) =>
  ({ uri, version, getText: () => text }) as vscode.TextDocument;

const range = (line: number) => new vscode.Range(line, 0, line, 6);
const position = new vscode.Position(1, 28);
const token = { isCancellationRequested: false } as vscode.CancellationToken;
const referenceContext = { includeDeclaration: true };

describe('ReviewLanguageFeatures', () => {
  let provider: ReviewLanguageFeatures;
  let reviewDocument: vscode.TextDocument;
  let localDocument: vscode.TextDocument;
  let localResults: Record<string, unknown>;
  let reviewResults: Record<string, unknown>;

  const localCalls = () =>
    asMock(vscode.commands.executeCommand).mock.calls.filter(([, uri]) => uri.scheme === 'file');

  beforeEach(() => {
    jest.clearAllMocks();
    reviewDocument = createDocument(reviewUri, CONTENT);
    localDocument = createDocument(localUri, CONTENT);
    localResults = {};
    reviewResults = {};
    asMock(vscode.workspace.onDidCloseTextDocument).mockReturnValue({ dispose: jest.fn() });
    asMock(mrCache.getMr).mockReturnValue(undefined);
    asMock(vscode.workspace.openTextDocument).mockImplementation(async (uri: vscode.Uri) => {
      if (uri.toString() === localUri.toString()) return localDocument;
      throw new Error(`file not found: ${uri}`);
    });
    asMock(vscode.commands.executeCommand).mockImplementation(
      async (command: string, uri: vscode.Uri) =>
        uri.scheme === REVIEW_URI_SCHEME ? reviewResults[command] ?? [] : localResults[command],
    );
    provider = new ReviewLanguageFeatures();
  });

  afterEach(() => provider.dispose());

  describe('when the local file has the same content', () => {
    it.each`
      method                     | command
      ${'provideDefinition'}     | ${'vscode.executeDefinitionProvider'}
      ${'provideTypeDefinition'} | ${'vscode.executeTypeDefinitionProvider'}
      ${'provideImplementation'} | ${'vscode.executeImplementationProvider'}
    `('$method forwards $command to the local file', async ({ method, command }) => {
      localResults[command] = [new vscode.Location(localUri, range(0))];

      const result = await provider[method as 'provideDefinition'](reviewDocument, position, token);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(command, localUri, position);
      expect(result).toEqual([new vscode.Location(reviewUri, range(0))]);
    });

    it('forwards references to the local file', async () => {
      localResults['vscode.executeReferenceProvider'] = [
        new vscode.Location(localUri, range(0)),
        new vscode.Location(localUri, range(1)),
      ];

      const result = await provider.provideReferences(
        reviewDocument,
        position,
        referenceContext,
        token,
      );

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.executeReferenceProvider',
        localUri,
        position,
      );
      expect(result).toEqual([
        new vscode.Location(reviewUri, range(0)),
        new vscode.Location(reviewUri, range(1)),
      ]);
    });

    it('forwards when only the line endings differ', async () => {
      localDocument = createDocument(localUri, CONTENT.replace(/\n/g, '\r\n'));
      localResults['vscode.executeDefinitionProvider'] = [new vscode.Location(localUri, range(0))];

      const result = await provider.provideDefinition(reviewDocument, position, token);

      expect(result).toEqual([new vscode.Location(reviewUri, range(0))]);
    });

    it('rewrites a location link in the local file and keeps the origin range', async () => {
      const link = {
        originSelectionRange: range(1),
        targetUri: localUri,
        targetRange: range(0),
        targetSelectionRange: range(0),
      };
      localResults['vscode.executeDefinitionProvider'] = [link];

      const result = await provider.provideDefinition(reviewDocument, position, token);

      expect(result).toEqual([{ ...link, targetUri: reviewUri }]);
    });

    it('leaves results in other files untouched', async () => {
      const link = { targetUri: otherUri, targetRange: range(3) };
      const location = new vscode.Location(otherUri, range(4));
      localResults['vscode.executeDefinitionProvider'] = [link, location];

      const result = await provider.provideDefinition(reviewDocument, position, token);

      expect(result).toEqual([link, location]);
    });

    it('returns undefined when the local file has no results', async () => {
      localResults['vscode.executeDefinitionProvider'] = [];

      expect(await provider.provideDefinition(reviewDocument, position, token)).toBeUndefined();
    });

    it('merges hovers into one', async () => {
      const markdown = new vscode.MarkdownString('const answer: 42');
      localResults['vscode.executeHoverProvider'] = [
        new vscode.Hover(markdown, range(1)),
        new vscode.Hover(['docs', 'more docs']),
      ];

      const result = await provider.provideHover(reviewDocument, position, token);

      expect(result).toEqual(new vscode.Hover([markdown, 'docs', 'more docs'], range(1)));
    });

    it('returns undefined when the forwarded command throws', async () => {
      asMock(vscode.commands.executeCommand).mockImplementation(async (_, uri: vscode.Uri) => {
        if (uri.scheme === REVIEW_URI_SCHEME) return [];
        throw new Error('language server crashed');
      });

      expect(await provider.provideDefinition(reviewDocument, position, token)).toBeUndefined();
    });

    it('does not forward a cancelled request', async () => {
      const cancelled = { isCancellationRequested: true } as vscode.CancellationToken;

      expect(await provider.provideDefinition(reviewDocument, position, cancelled)).toBeUndefined();
      expect(localCalls()).toEqual([]);
    });
  });

  describe('when another provider answers for the review document', () => {
    it('does not forward, so that results do not show twice', async () => {
      reviewResults['vscode.executeDefinitionProvider'] = [
        new vscode.Location(reviewUri, range(0)),
      ];

      expect(await provider.provideDefinition(reviewDocument, position, token)).toBeUndefined();
      expect(localCalls()).toEqual([]);
    });

    it('stays silent while it asks the other providers', async () => {
      let nestedResult: unknown = 'not called';
      asMock(vscode.commands.executeCommand).mockImplementation(
        async (command: string, uri: vscode.Uri) => {
          if (uri.scheme !== REVIEW_URI_SCHEME) return [new vscode.Location(localUri, range(0))];
          // VS Code calls every registered provider, including this one
          nestedResult = await provider.provideDefinition(reviewDocument, position, token);
          return [];
        },
      );

      const result = await provider.provideDefinition(reviewDocument, position, token);

      expect(nestedResult).toBeUndefined();
      expect(result).toEqual([new vscode.Location(reviewUri, range(0))]);
    });
  });

  describe('does not forward', () => {
    it('when the local file differs', async () => {
      localDocument = createDocument(localUri, `// local change\n${CONTENT}`);

      expect(await provider.provideDefinition(reviewDocument, position, token)).toBeUndefined();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('when the local file is missing', async () => {
      asMock(vscode.workspace.openTextDocument).mockRejectedValue(new Error('file not found'));

      expect(await provider.provideDefinition(reviewDocument, position, token)).toBeUndefined();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('for the empty file of an added or deleted file', async () => {
      const document = createDocument(emptyFileUri, '');

      expect(await provider.provideDefinition(document, position, token)).toBeUndefined();
      expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it('for documents that are not review documents', async () => {
      expect(await provider.provideDefinition(localDocument, position, token)).toBeUndefined();
      expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    });
  });

  describe('on the base side', () => {
    const BASE_CONTENT = `const unused = 0;\n${CONTENT}`;
    const HEAD_CONTENT = `// the answer\n// is 42\n${CONTENT}`;
    const baseUri = toReviewUri({ ...reviewParams, commit: 'base-sha' });
    // built like the head URI of the diff, from the new path of the diff file
    const headUri = toReviewUri({ ...reviewParams, path: 'src/navigation.ts', commit: 'head-sha' });
    const cachedMrVersion: RestMrVersion = {
      ...mrVersion,
      base_commit_sha: 'base-sha',
      head_commit_sha: 'head-sha',
      diffs: [
        {
          ...diffFile,
          old_path: 'src/navigation.ts',
          new_path: 'src/navigation.ts',
          diff: '@@ -1,3 +1,4 @@\n-const unused = 0;\n+// the answer\n+// is 42\n export const answer = 42;\n export const double = () => answer * 2;\n',
        },
      ],
    };
    const unchangedPosition = new vscode.Position(2, 28);
    let baseDocument: vscode.TextDocument;
    let headDocument: vscode.TextDocument;

    beforeEach(() => {
      baseDocument = createDocument(baseUri, BASE_CONTENT);
      headDocument = createDocument(headUri, HEAD_CONTENT);
      localDocument = createDocument(localUri, HEAD_CONTENT);
      asMock(gitlabProjectRepository.getSelectedOrDefaultForRepository).mockReturnValue(
        projectInRepository,
      );
      asMock(mrCache.getMr).mockReturnValue({ mr, mrVersion: cachedMrVersion });
      asMock(vscode.workspace.openTextDocument).mockImplementation(async (uri: vscode.Uri) => {
        if (uri.toString() === localUri.toString()) return localDocument;
        if (uri.toString() === headUri.toString()) return headDocument;
        throw new Error(`file not found: ${uri}`);
      });
    });

    it('forwards an unchanged line to its line in the local file and shows results in the head', async () => {
      localResults['vscode.executeDefinitionProvider'] = [new vscode.Location(localUri, range(2))];

      const result = await provider.provideDefinition(baseDocument, unchangedPosition, token);

      expect(mrCache.getMr).toHaveBeenCalledWith(2, projectInRepository);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.executeDefinitionProvider',
        baseUri,
        unchangedPosition,
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.executeDefinitionProvider',
        localUri,
        new vscode.Position(3, 28),
      );
      expect(result).toEqual([new vscode.Location(headUri, range(2))]);
    });

    it('moves the hover range back to the base line', async () => {
      localResults['vscode.executeHoverProvider'] = [
        new vscode.Hover('const answer: 42', range(3)),
      ];

      const result = await provider.provideHover(baseDocument, unchangedPosition, token);

      expect(result).toEqual(new vscode.Hover('const answer: 42', range(2)));
    });

    it('does not forward a removed line', async () => {
      const removedLine = new vscode.Position(0, 6);

      expect(await provider.provideDefinition(baseDocument, removedLine, token)).toBeUndefined();
      expect(localCalls()).toEqual([]);
    });

    it('does not forward when the local file differs from the head', async () => {
      localDocument = createDocument(localUri, `// local change\n${HEAD_CONTENT}`);

      expect(
        await provider.provideDefinition(baseDocument, unchangedPosition, token),
      ).toBeUndefined();
      expect(localCalls()).toEqual([]);
    });

    it('does not forward when the MR is not loaded', async () => {
      asMock(mrCache.getMr).mockReturnValue(undefined);

      expect(
        await provider.provideDefinition(baseDocument, unchangedPosition, token),
      ).toBeUndefined();
      expect(localCalls()).toEqual([]);
    });

    it('forwards directly when the base is the same as the local file', async () => {
      localDocument = createDocument(localUri, BASE_CONTENT);
      localResults['vscode.executeDefinitionProvider'] = [new vscode.Location(localUri, range(1))];

      const result = await provider.provideDefinition(baseDocument, unchangedPosition, token);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.executeDefinitionProvider',
        localUri,
        unchangedPosition,
      );
      expect(result).toEqual([new vscode.Location(baseUri, range(1))]);
    });
  });

  describe('content comparison', () => {
    it('is cached until one of the documents changes', async () => {
      const getText = jest.fn(() => CONTENT);
      localDocument = { uri: localUri, version: 1, getText } as unknown as vscode.TextDocument;

      await provider.provideDefinition(reviewDocument, position, token);
      await provider.provideDefinition(reviewDocument, position, token);
      expect(getText).toHaveBeenCalledTimes(1);

      localDocument = createDocument(localUri, `// local change\n${CONTENT}`, 2);
      localResults['vscode.executeDefinitionProvider'] = [new vscode.Location(localUri, range(0))];

      expect(await provider.provideDefinition(reviewDocument, position, token)).toBeUndefined();
    });
  });
});

describe('registerReviewLanguageFeatures', () => {
  it('registers all providers for review documents', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

    registerReviewLanguageFeatures(context);

    const selector = { scheme: REVIEW_URI_SCHEME };
    [
      vscode.languages.registerDefinitionProvider,
      vscode.languages.registerTypeDefinitionProvider,
      vscode.languages.registerImplementationProvider,
      vscode.languages.registerReferenceProvider,
      vscode.languages.registerHoverProvider,
    ].forEach(register =>
      expect(register).toHaveBeenCalledWith(selector, expect.any(ReviewLanguageFeatures)),
    );
    expect(context.subscriptions).toHaveLength(6);
  });
});
