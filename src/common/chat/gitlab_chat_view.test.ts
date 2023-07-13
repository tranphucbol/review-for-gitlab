import * as vscode from 'vscode';
import { GitLabChatView } from './gitlab_chat_view';
import { GitLabChatController } from './gitlab_chat_controller';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabChatRecord } from './gitlab_chat_record';

jest.mock('../utils/wait_for_webview');

describe('GitLabChatView', () => {
  let view: GitLabChatView;
  let controller: GitLabChatController;
  let platformManager: GitLabPlatformManager;
  let context: vscode.ExtensionContext;
  let webview: vscode.WebviewView;

  beforeEach(() => {
    webview = {
      webview: {
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
      } as Partial<vscode.Webview> as vscode.Webview,
      onDidDispose: jest.fn(),
      show: jest.fn(),
    } as Partial<vscode.WebviewView> as vscode.WebviewView;

    controller = new GitLabChatController(context, platformManager);
    view = new GitLabChatView(controller);
  });

  describe('resolveWebviewView', () => {
    it('updates webview with proper html options', async () => {
      await view.resolveWebviewView(webview);

      expect(webview.webview.options).toEqual({ enableScripts: true });
      expect(webview.webview.html).toEqual('<html><body>Chat Window HTML code.</body></html>');
    });

    it('sets message processing and dispose callbacks', async () => {
      await view.resolveWebviewView(webview);

      expect(webview.webview.onDidReceiveMessage).toBeCalledWith(expect.any(Function), view);
      expect(webview.onDidDispose).toBeCalledWith(expect.any(Function), view);
    });

    it('restores chat history', async () => {
      controller.chatHistory = [
        new GitLabChatRecord({ author: 'user', text: 'ping' }),
        new GitLabChatRecord({ author: 'gitLabChat', text: 'pong' }),
      ];

      await view.resolveWebviewView(webview);

      expect(webview.webview.postMessage).toHaveBeenNthCalledWith(1, {
        eventType: 'newPrompt',
        record: controller.chatHistory[0],
      });
      expect(webview.webview.postMessage).toHaveBeenNthCalledWith(2, {
        eventType: 'newResponse',
        record: controller.chatHistory[1],
      });
    });

    it('sends focus event', async () => {
      await view.resolveWebviewView(webview);

      expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'focus' });
    });
  });

  describe('show', () => {
    it('shows the chatview with focus if it is present', async () => {
      await view.resolveWebviewView(webview);

      await view.show();

      expect(webview.show).toBeCalled();
      expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'focus' });
    });

    it('executes vscode command if the view is not present', async () => {
      vscode.commands.executeCommand = jest.fn();

      await view.show();

      expect(vscode.commands.executeCommand).toBeCalledWith('gl.chatView.focus');
    });
  });

  describe('with webview initialized', () => {
    beforeEach(async () => {
      await view.resolveWebviewView(webview);
    });

    describe('addRecord', () => {
      it('sends newPrompt view message', async () => {
        const record = new GitLabChatRecord({ author: 'user', text: 'hello' });

        await view.addRecord(record);

        expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'newPrompt', record });
      });

      it('sends newResponse view message', async () => {
        const record = new GitLabChatRecord({ author: 'gitLabChat', text: 'hello' });

        await view.addRecord(record);

        expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'newResponse', record });
      });
    });

    describe('updateRecord', () => {
      it('sends updateRecord view message', async () => {
        const record = new GitLabChatRecord({ author: 'user', text: 'hello' });

        await view.updateRecord(record);

        expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'updateRecord', record });
      });

      it('sends newResponse view message', async () => {
        const record = new GitLabChatRecord({ author: 'gitLabChat', text: 'hello' });

        await view.addRecord(record);

        expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'newResponse', record });
      });
    });
  });
});
