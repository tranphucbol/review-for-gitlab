const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const openMergeRequestResponse = require('./fixtures/rest/open_mr.json');
const versionsResponse = require('./fixtures/rest/versions.json');
const versionResponse = require('./fixtures/rest/mr_version.json');
const {
  getServer,
  createJsonEndpoint,
  createQueryJsonEndpoint,
  createQueryTextEndpoint,
} = require('./test_infrastructure/mock_server');
const { getRepositoryRoot } = require('./test_infrastructure/helpers');
const { toReviewUri } = require('../../src/desktop/review/review_uri');
const { ReviewLanguageFeatures } = require('../../src/desktop/review/review_language_features');
const { mrCache } = require('../../src/desktop/gitlab/mr_cache');
const { gitlabProjectRepository } = require('../../src/desktop/gitlab/gitlab_project_repository');

const HEAD_CONTENT = 'export const answer = 42;\nexport const double = () => answer * 2;\n';
// the MR removes the first line, the other lines move one line up
const BASE_CONTENT = `const unused = 0;\n${HEAD_CONTENT}`;
const BASE_TO_HEAD_DIFF =
  '@@ -1,3 +1,2 @@\n-const unused = 0;\n export const answer = 42;\n export const double = () => answer * 2;\n';
// `answer` in `export const double = () => answer * 2;`
const USAGE_POSITION = new vscode.Position(1, 28);
const BASE_USAGE_POSITION = new vscode.Position(2, 28);

// Served only by the stub provider below, which, like gopls or jdtls, supports `file:` documents only
const STUB_FILE_PATH = 'src/navigation.stub';
// Served by the built-in TypeScript extension, which supports review documents on its own
const TS_FILE_PATH = 'src/navigation.ts';

const WARM_UP_TIMEOUT_MS = 30000;

const sleep = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/** The TypeScript server needs a while to start, we retry until it answers. */
const pollUntilNonEmpty = async (fn, timeoutMs = WARM_UP_TIMEOUT_MS) => {
  const start = Date.now();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fn();
    if ((Array.isArray(result) && result.length > 0) || Date.now() - start > timeoutMs)
      return result;
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
};

const executeDefinition = (uri, position) =>
  vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, position);

const targetUri = location => location.targetUri ?? location.uri;
const targetRange = location => location.targetSelectionRange ?? location.range;

const wordRanges = (document, word) =>
  document
    .getText()
    .split('\n')
    .flatMap((text, line) =>
      [...text.matchAll(new RegExp(`\\b${word}\\b`, 'g'))].map(
        m => new vscode.Range(line, m.index, line, m.index + word.length),
      ),
    );

const wordAt = (document, position) => {
  const range = document.getWordRangeAtPosition(position);
  return range && document.getText(range);
};

const registerStubLanguageServer = () => {
  const selector = { scheme: 'file', pattern: `**/${STUB_FILE_PATH}` };
  return vscode.Disposable.from(
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition: (document, position) => {
        const word = wordAt(document, position);
        const declaration = word && wordRanges(document, word)[0];
        return declaration ? [new vscode.Location(document.uri, declaration)] : [];
      },
    }),
    vscode.languages.registerReferenceProvider(selector, {
      provideReferences: (document, position) => {
        const word = wordAt(document, position);
        return word
          ? wordRanges(document, word).map(r => new vscode.Location(document.uri, r))
          : [];
      },
    }),
    vscode.languages.registerHoverProvider(selector, {
      provideHover: (document, position) => {
        const word = wordAt(document, position);
        return word && new vscode.Hover(`stub hover for ${word}`);
      },
    }),
  );
};

describe('MR review code navigation', function reviewCodeNavigation() {
  this.timeout(60000);

  let server;
  let stubLanguageServer;
  const localFiles = [];

  const reviewUri = (filePath, commit) =>
    toReviewUri({
      path: filePath,
      exists: true,
      commit,
      repositoryRoot: getRepositoryRoot(),
      projectId: openMergeRequestResponse.project_id,
      mrId: openMergeRequestResponse.id,
    });

  const fileEndpoints = filePath => {
    const encodedPath = encodeURIComponent(filePath);
    const files = {
      [`?ref=${versionResponse.head_commit_sha}`]: HEAD_CONTENT,
      [`?ref=${versionResponse.base_commit_sha}`]: BASE_CONTENT,
    };
    const sizes = Object.fromEntries(
      Object.entries(files).map(([query, content]) => [
        query,
        { size: Buffer.byteLength(content) },
      ]),
    );
    return [
      createQueryTextEndpoint(`/projects/278964/repository/files/${encodedPath}/raw`, files),
      createQueryJsonEndpoint(`/projects/278964/repository/files/${encodedPath}`, sizes),
    ];
  };

  const writeLocalFile = filePath => {
    const localFilePath = path.join(getRepositoryRoot(), filePath);
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    fs.writeFileSync(localFilePath, HEAD_CONTENT);
    localFiles.push(localFilePath);
    return vscode.Uri.file(localFilePath);
  };

  before(() => {
    server = getServer([
      ...fileEndpoints(STUB_FILE_PATH),
      ...fileEndpoints(TS_FILE_PATH),
      createJsonEndpoint('/projects/278964/merge_requests/33824/versions', versionsResponse),
      createJsonEndpoint('/projects/278964/merge_requests/33824/versions/127919672', {
        ...versionResponse,
        diffs: [
          {
            old_path: STUB_FILE_PATH,
            new_path: STUB_FILE_PATH,
            new_file: false,
            deleted_file: false,
            renamed_file: false,
            diff: BASE_TO_HEAD_DIFF,
          },
        ],
      }),
    ]);
    stubLanguageServer = registerStubLanguageServer();
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    stubLanguageServer.dispose();
    server.close();
    localFiles.forEach(f => fs.rmSync(f, { force: true }));
  });

  describe('language server that supports only local files', () => {
    let localFileUri;
    let headUri;

    before(async () => {
      localFileUri = writeLocalFile(STUB_FILE_PATH);
      headUri = reviewUri(STUB_FILE_PATH, versionResponse.head_commit_sha);
      const reviewDocument = await vscode.workspace.openTextDocument(headUri);
      assert.strictEqual(reviewDocument.getText(), HEAD_CONTENT);
    });

    it('finds the definition in the local file', async () => {
      const locations = await executeDefinition(localFileUri, USAGE_POSITION);

      assert.strictEqual(locations.length, 1);
      assert.strictEqual(targetUri(locations[0]).fsPath, localFileUri.fsPath);
      assert.strictEqual(targetRange(locations[0]).start.line, 0);
    });

    it('finds the definition in the review document', async () => {
      const locations = await executeDefinition(headUri, USAGE_POSITION);

      assert.strictEqual(locations.length, 1);
      assert.strictEqual(targetUri(locations[0]).toString(), headUri.toString());
      assert.strictEqual(targetRange(locations[0]).start.line, 0);
    });

    it('finds references in the review document', async () => {
      const locations = await vscode.commands.executeCommand(
        'vscode.executeReferenceProvider',
        headUri,
        USAGE_POSITION,
      );

      assert.deepStrictEqual(locations.map(l => [l.uri.toString(), l.range.start.line]).sort(), [
        [headUri.toString(), 0],
        [headUri.toString(), 1],
      ]);
    });

    it('shows hover in the review document', async () => {
      const hovers = await vscode.commands.executeCommand(
        'vscode.executeHoverProvider',
        headUri,
        USAGE_POSITION,
      );

      const text = hovers
        .flatMap(h => h.contents)
        .map(c => (typeof c === 'string' ? c : c.value))
        .join('\n');
      assert.strictEqual(text, 'stub hover for answer');
    });

    it('finds nothing on a line the MR removed', async () => {
      const baseUri = reviewUri(STUB_FILE_PATH, versionResponse.base_commit_sha);
      await vscode.workspace.openTextDocument(baseUri);

      const locations = await executeDefinition(baseUri, new vscode.Position(0, 6));

      assert.deepStrictEqual(locations, []);
    });

    it('finds nothing when the local file differs from the review document', async () => {
      const localDocument = await vscode.workspace.openTextDocument(localFileUri);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(localFileUri, new vscode.Position(0, 0), '// local change\n');
      assert(await vscode.workspace.applyEdit(edit));

      try {
        // the local file navigates, but its positions no longer match the review document
        const localLocations = await executeDefinition(localFileUri, new vscode.Position(2, 28));
        assert.strictEqual(localLocations.length, 1);

        const locations = await executeDefinition(headUri, USAGE_POSITION);
        assert.deepStrictEqual(locations, []);
      } finally {
        const undo = new vscode.WorkspaceEdit();
        undo.delete(localFileUri, new vscode.Range(0, 0, 1, 0));
        await vscode.workspace.applyEdit(undo);
        await localDocument.save();
      }
    });

    describe('on the base side', () => {
      const { token } = new vscode.CancellationTokenSource();
      let provider;
      let baseDocument;

      before(async () => {
        // The provider registered by the extension reads the MR from the extension's own cache,
        // which only the MR tree view fills. This instance reads the cache of the test modules.
        const project = gitlabProjectRepository.getProjectOrFail(getRepositoryRoot());
        await mrCache.reloadMr(openMergeRequestResponse, project);
        provider = new ReviewLanguageFeatures();
        baseDocument = await vscode.workspace.openTextDocument(
          reviewUri(STUB_FILE_PATH, versionResponse.base_commit_sha),
        );
      });

      after(() => provider.dispose());

      it('finds the definition from an unchanged line in the head document', async () => {
        const locations = await provider.provideDefinition(
          baseDocument,
          BASE_USAGE_POSITION,
          token,
        );

        assert.strictEqual(locations.length, 1);
        assert.strictEqual(targetUri(locations[0]).toString(), headUri.toString());
        assert.strictEqual(targetRange(locations[0]).start.line, 0);
      });

      it('shows hover on the base line', async () => {
        const hover = await provider.provideHover(baseDocument, BASE_USAGE_POSITION, token);

        assert.strictEqual(hover.contents[0].value ?? hover.contents[0], 'stub hover for answer');
        assert.strictEqual(hover.range.start.line, BASE_USAGE_POSITION.line);
      });

      it('finds nothing on a line the MR removed', async () => {
        const removedLine = new vscode.Position(0, 6);

        assert.strictEqual(
          await provider.provideDefinition(baseDocument, removedLine, token),
          undefined,
        );
      });
    });
  });

  describe('language server that supports review documents itself', () => {
    let headUri;

    before(async () => {
      writeLocalFile(TS_FILE_PATH);
      headUri = reviewUri(TS_FILE_PATH, versionResponse.head_commit_sha);
      await vscode.workspace.openTextDocument(headUri);
    });

    it('does not duplicate its results', async () => {
      const locations = await pollUntilNonEmpty(() => executeDefinition(headUri, USAGE_POSITION));

      assert.strictEqual(locations.length, 1);
      assert.strictEqual(targetUri(locations[0]).toString(), headUri.toString());
      assert.strictEqual(targetRange(locations[0]).start.line, 0);
    });
  });
});
