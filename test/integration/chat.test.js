const vscode = require('vscode');
const assert = require('assert');
const sinon = require('sinon');
const { graphql } = require('msw');
// const proxyquire = require('proxyquire');
const { GitLabChatController } = require('../../src/common/chat/gitlab_chat_controller');
const {
  gitlabPlatformManagerDesktop,
} = require('../../src/desktop/gitlab/gitlab_platform_desktop');
const {
  newPromptResponse,
  newResponseResponse,
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
      graphql.query('getAiMessages', (req, res, ctx) => res(ctx.data(newResponseResponse))),
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

    const userMessage = await webviewMock.waitForMessage(
      m => m.eventType === 'newRecord' && m.record.role === 'user',
    );
    assert.strictEqual(userMessage.record.content, 'hi!');

    const responseMessage = await webviewMock.waitForMessage(
      m => m.eventType === 'updateRecord' && m.record.role === 'assistant',
    );

    assert.strictEqual(
      responseMessage.record.content,
      newResponseResponse.aiMessages.nodes[0].content,
    );
  });

  it('allows commands to send custom prompts to the chat', async () => {
    const record = {
      role: 'user',
      type: 'explainCode',
      content: 'MyCustomCommand',
    };

    controller.processNewUserRecord(record);

    const userMessage = await webviewMock.waitForMessage(
      m => m.eventType === 'newRecord' && m.record.role === 'user',
    );
    assert.strictEqual(userMessage.record.content, 'MyCustomCommand');

    const responseMessage = await webviewMock.waitForMessage(
      m => m.eventType === 'updateRecord' && m.record.role === 'assistant',
    );

    assert.strictEqual(
      responseMessage.record.content,
      newResponseResponse.aiMessages.nodes[0].content,
    );
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
        m => m.eventType === 'updateRecord' && m.record.role === 'assistant',
      );

      assert.equal(responseMessage.record.errors[0], 'Reached timeout while fetching response.');
    });
  });
});
