const vscode = require('vscode');
const assert = require('assert');
const sinon = require('sinon');
const { graphql } = require('msw');
// const proxyquire = require('proxyquire');
const { GitLabChatController } = require('../../src/common/chat/gitlab_chat_controller');
const { GitLabChatRecord } = require('../../src/common/chat/gitlab_chat_record');
const {
  gitlabPlatformManagerDesktop,
} = require('../../src/desktop/gitlab/gitlab_platform_desktop');
const {
  newPromptResponse,
  newMessageResponse,
  noMessageResponse,
} = require('./fixtures/graphql/chat');
const { WebviewMock } = require('./test_infrastructure/webview_mock');

const { getServer } = require('./test_infrastructure/mock_server');

const { API_PULLING } = require('../../src/common/chat/api/pulling');

API_PULLING.interval = 1; // wait only 1ms between pulling attempts.

describe('GitLab Duo Chat', () => {
  let server;
  let controller;
  const sandbox = sinon.createSandbox();
  let webviewMock;
  let contextMock;

  before(async () => {
    server = getServer([
      graphql.query('getAiMessages', (req, res, ctx) => res(ctx.data(newMessageResponse(req)))),
      graphql.mutation('chat', (req, res, ctx) => res(ctx.data(newPromptResponse))),
    ]);
  });

  beforeEach(async () => {
    contextMock = {
      extensionUri: vscode.Uri.file('foo/bar'),
    };

    const fs = { ...vscode.workspace.fs };
    Object.defineProperty(fs, 'readFile', {
      value: sinon.stub().resolves(Buffer.from('Foo Bar')),
      configurable: true,
      writable: true,
    });
    sandbox.stub(vscode.workspace, 'fs').value(fs);

    server.resetHandlers();
    controller = new GitLabChatController(gitlabPlatformManagerDesktop, contextMock);
    webviewMock = new WebviewMock(sandbox);

    await controller.resolveWebviewView(webviewMock.webview);
  });

  afterEach(async () => {
    await webviewMock.webview.dispose();
    sandbox.restore();
  });

  after(async () => {
    server.close();
  });

  it('allows user to send prompts and get responses', async () => {
    webviewMock.emulateViewMessage({
      eventType: 'newPrompt',
      record: {
        content: 'hi!',
      },
    });

    let updatedMessages = await webviewMock.waitForMessage(m => m.eventType === 'updateRecord', 2);
    updatedMessages = updatedMessages.map(m => m.record.content);

    assert.strictEqual(updatedMessages.includes('USER message'), true);
    assert.strictEqual(updatedMessages.includes('ASSISTANT message'), true);
  });

  it('allows commands to send custom prompts to the chat', async () => {
    const record = new GitLabChatRecord({
      role: 'user',
      type: 'explainCode',
      content: 'MyCustomCommand',
    });

    controller.processNewUserRecord(record);

    let updatedMessages = await webviewMock.waitForMessage(m => m.eventType === 'updateRecord', 2);
    updatedMessages = updatedMessages.map(m => m.record.content);

    assert.strictEqual(updatedMessages.includes('USER message'), true);
    assert.strictEqual(updatedMessages.includes('ASSISTANT message'), true);
  });

  describe('with no response available after all pulling attempts', () => {
    beforeEach(() => {
      server.use(
        graphql.query('getAiMessages', (req, res, ctx) => res(ctx.data(noMessageResponse))),
      );
    });

    it('sets error in the message', async () => {
      webviewMock.emulateViewMessage({
        eventType: 'newPrompt',
        record: {
          content: 'hi!',
        },
      });

      const responseMessage = await webviewMock.waitForMessage(
        m => m.eventType === 'updateRecord' && m.record.role === 'user',
      );

      assert.equal(responseMessage.record.errors[0], 'Reached timeout while fetching response.');
    });
  });
});
