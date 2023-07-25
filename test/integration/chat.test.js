const assert = require('assert');
const sinon = require('sinon');
const { graphql } = require('msw');
const { GitLabChatController } = require('../../src/common/chat/gitlab_chat_controller');
const {
  gitlabPlatformManagerDesktop,
} = require('../../src/desktop/gitlab/gitlab_platform_desktop');
const { newPromptResponse, newResponseResponse } = require('./fixtures/graphql/chat');
const { WebviewMock } = require('./test_infrastructure/webview_mock');

const { getServer } = require('./test_infrastructure/mock_server');

describe('GitLab Duo Chat', () => {
  let server;
  let controller;
  const sandbox = sinon.createSandbox();
  let webviewMock;

  before(async () => {
    server = getServer([
      graphql.query('getAiMessages', (req, res, ctx) => res(ctx.data(newResponseResponse))),
      graphql.mutation('chat', (req, res, ctx) => res(ctx.data(newPromptResponse))),
    ]);
  });

  beforeEach(async () => {
    server.resetHandlers();
    controller = new GitLabChatController(gitlabPlatformManagerDesktop);
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
        text: 'hi!',
      },
    });

    const userMessage = await webviewMock.waitForMessage(
      m => m.eventType === 'newRecord' && m.record.author === 'user',
    );
    assert.strictEqual(userMessage.record.text, 'hi!');

    const responseMessage = await webviewMock.waitForMessage(
      m => m.eventType === 'updateRecord' && m.record.author === 'gitLabChat',
    );

    assert.strictEqual(
      responseMessage.record.text,
      newResponseResponse.aiMessages.nodes[0].content,
    );
  });

  it('allows commands to send custom prompts to the chat', async () => {
    const record = {
      author: 'user',
      type: 'explainCode',
      text: 'MyCustomCommand',
    };

    controller.processNewUserRecord(record);

    const userMessage = await webviewMock.waitForMessage(
      m => m.eventType === 'newRecord' && m.record.author === 'user',
    );
    assert.strictEqual(userMessage.record.text, 'MyCustomCommand');

    const responseMessage = await webviewMock.waitForMessage(
      m => m.eventType === 'updateRecord' && m.record.author === 'gitLabChat',
    );

    assert.strictEqual(
      responseMessage.record.text,
      newResponseResponse.aiMessages.nodes[0].content,
    );
  });
});
