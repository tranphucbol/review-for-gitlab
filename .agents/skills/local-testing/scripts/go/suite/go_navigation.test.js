/* eslint-disable import/no-dynamic-require, no-await-in-loop */
const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const integration = path.resolve(__dirname, '../../../../../../dist-desktop/test/integration');
const dist = path.resolve(integration, '../..');
const openMr = require(path.join(integration, 'fixtures/rest/open_mr.json'));
const versionsResponse = require(path.join(integration, 'fixtures/rest/versions.json'));
const versionResponse = require(path.join(integration, 'fixtures/rest/mr_version.json'));
const { getServer, createJsonEndpoint } = require(
  path.join(integration, 'test_infrastructure/mock_server'),
);
const { toReviewUri } = require(path.join(dist, 'src/desktop/review/review_uri'));
const { ReviewLanguageFeatures } = require(
  path.join(dist, 'src/desktop/review/review_language_features'),
);
const { mrCache } = require(path.join(dist, 'src/desktop/gitlab/mr_cache'));
const { gitlabProjectRepository } = require(
  path.join(dist, 'src/desktop/gitlab/gitlab_project_repository'),
);

const { E2E_BASE_SHA: BASE_SHA, E2E_HEAD_SHA: HEAD_SHA, E2E_MAIN_DIFF: MAIN_DIFF } = process.env;
const root = () => vscode.workspace.workspaceFolders[0].uri.fsPath;

const sleep = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });
const poll = async (fn, timeoutMs = 60000) => {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if ((Array.isArray(result) && result.length > 0) || Date.now() - start > timeoutMs)
      return result;
    await sleep(500);
  }
};

const targetUri = l => l.targetUri ?? l.uri;
const targetRange = l => l.targetSelectionRange ?? l.range;
const hoverText = hovers =>
  hovers
    .flatMap(h => h.contents)
    .map(c => (typeof c === 'string' ? c : c.value))
    .join('\n');
const execute = (command, uri, position) =>
  vscode.commands.executeCommand(`vscode.execute${command}Provider`, uri, position);

// head main.go: line 10 is `\tfmt.Println(Greet("head"), Hello())`
const GREET_CALL = new vscode.Position(10, 14);
const HELLO_CALL = new vscode.Position(10, 29);
const HELLO_DECLARATION_LINE = 5;

describe('Go review code navigation (golang.go + gopls)', () => {
  const reviewUri = commit =>
    toReviewUri({
      path: 'main.go',
      exists: true,
      commit,
      repositoryRoot: root(),
      projectId: openMr.project_id,
      mrId: openMr.id,
    });
  let localUri;
  let headUri;
  let baseUri;

  before(async () => {
    localUri = vscode.Uri.file(path.join(root(), 'main.go'));
    headUri = reviewUri(HEAD_SHA);
    baseUri = reviewUri(BASE_SHA);
    await vscode.extensions.getExtension('golang.go').activate();
    await vscode.window.showTextDocument(localUri);
  });

  after(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  it('gopls answers for the local file', async () => {
    const locations = await poll(() => execute('Definition', localUri, HELLO_CALL));
    assert.strictEqual(locations.length, 1);
    assert.strictEqual(targetRange(locations[0]).start.line, HELLO_DECLARATION_LINE);
  });

  it('opens the MR diff as Go documents', async () => {
    await vscode.commands.executeCommand('vscode.diff', baseUri, headUri, 'main.go (MR)');
    const headDocument = await vscode.workspace.openTextDocument(headUri);
    assert.strictEqual(headDocument.languageId, 'go');
    assert.strictEqual(vscode.window.activeTextEditor.document.uri.toString(), headUri.toString());
  });

  it('jumps to a same-file definition inside the review document', async () => {
    const locations = await execute('Definition', headUri, HELLO_CALL);
    assert.strictEqual(locations.length, 1);
    assert.strictEqual(targetUri(locations[0]).toString(), headUri.toString());
    assert.strictEqual(targetRange(locations[0]).start.line, HELLO_DECLARATION_LINE);
  });

  it('jumps to another file in the local checkout', async () => {
    const locations = await execute('Definition', headUri, GREET_CALL);
    assert.strictEqual(locations.length, 1);
    assert.strictEqual(targetUri(locations[0]).fsPath, path.join(root(), 'greet.go'));
    assert.strictEqual(targetRange(locations[0]).start.line, 2);
  });

  it('finds references inside the review document', async () => {
    const locations = await execute('Reference', headUri, HELLO_CALL);
    assert.deepStrictEqual(locations.map(l => [l.uri.toString(), l.range.start.line]).sort(), [
      [headUri.toString(), 10],
      [headUri.toString(), HELLO_DECLARATION_LINE],
    ]);
  });

  it('shows the gopls hover', async () => {
    const text = hoverText(await execute('Hover', headUri, HELLO_CALL));
    assert.match(text, /func Hello\(\) string/);
    assert.match(text, /Hello says hello/);
  });

  it('finds nothing while the local file has unsaved changes', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(localUri, new vscode.Position(0, 0), '// local change\n');
    assert(await vscode.workspace.applyEdit(edit));
    try {
      assert.deepStrictEqual(await execute('Definition', headUri, HELLO_CALL), []);
    } finally {
      const undo = new vscode.WorkspaceEdit();
      undo.delete(localUri, new vscode.Range(0, 0, 1, 0));
      await vscode.workspace.applyEdit(undo);
      await (await vscode.workspace.openTextDocument(localUri)).save();
    }
  });

  describe('on the base side', () => {
    const { token } = new vscode.CancellationTokenSource();
    let server;
    let provider;
    let baseDocument;

    before(async () => {
      server = getServer([
        createJsonEndpoint('/projects/278964/merge_requests/33824/versions', versionsResponse),
        createJsonEndpoint('/projects/278964/merge_requests/33824/versions/127919672', {
          ...versionResponse,
          base_commit_sha: BASE_SHA,
          start_commit_sha: BASE_SHA,
          head_commit_sha: HEAD_SHA,
          diffs: [
            {
              old_path: 'main.go',
              new_path: 'main.go',
              new_file: false,
              deleted_file: false,
              renamed_file: false,
              diff: MAIN_DIFF,
            },
          ],
        }),
      ]);
      await mrCache.reloadMr(openMr, gitlabProjectRepository.getProjectOrFail(root()));
      provider = new ReviewLanguageFeatures();
      baseDocument = await vscode.workspace.openTextDocument(baseUri);
    });

    after(() => {
      provider.dispose();
      server.close();
    });

    it('maps an unchanged line to the head and lands in the head document', async () => {
      // base line 4 `func main() {` is head line 9
      const locations = await provider.provideDefinition(
        baseDocument,
        new vscode.Position(4, 6),
        token,
      );
      assert.strictEqual(locations.length, 1);
      assert.strictEqual(targetUri(locations[0]).toString(), headUri.toString());
      assert.strictEqual(targetRange(locations[0]).start.line, 9);
    });

    it('shows the gopls hover on the base line', async () => {
      const hover = await provider.provideHover(baseDocument, new vscode.Position(4, 6), token);
      assert.match(hoverText([hover]), /func main\(\)/);
      assert.strictEqual(hover.range.start.line, 4);
    });

    it('finds nothing on a line the MR changed', async () => {
      // base line 5 `\tfmt.Println(Greet("base"))`
      const locations = await provider.provideDefinition(
        baseDocument,
        new vscode.Position(5, 14),
        token,
      );
      assert.strictEqual(locations, undefined);
    });
  });
});
