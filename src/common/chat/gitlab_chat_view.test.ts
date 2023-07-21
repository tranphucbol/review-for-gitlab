import * as vscode from 'vscode';
import { GitLabChatView } from './gitlab_chat_view';
import { GitLabChatRecord } from './gitlab_chat_record';

jest.mock('../utils/wait_for_webview');

describe('GitLabChatView', () => {
  let view: GitLabChatView;
  let webview: vscode.WebviewView;
  const viewProcessCallback = jest.fn();

  beforeEach(() => {
    webview = {
      webview: {
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
      } as Partial<vscode.Webview> as vscode.Webview,
      onDidDispose: jest.fn(),
      show: jest.fn(),
    } as Partial<vscode.WebviewView> as vscode.WebviewView;

    view = new GitLabChatView();
    view.onViewMessage(viewProcessCallback);
  });

  describe('resolveWebviewView', () => {
    it('updates webview with proper html options', async () => {
      await view.resolveWebviewView(webview);

      expect(webview.webview.options).toEqual({ enableScripts: true });
      expect(webview.webview.html.length).toBeGreaterThan(0);
    });

    it('sets message processing and dispose callbacks', async () => {
      await view.resolveWebviewView(webview);

      expect(webview.webview.onDidReceiveMessage).toBeCalledWith(expect.any(Function));
      expect(webview.onDidDispose).toBeCalledWith(expect.any(Function), view);
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
      it('sends newRecord view message', async () => {
        const record = new GitLabChatRecord({ author: 'user', text: 'hello' });

        await view.addRecord(record);

        expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'newRecord', record });
      });
    });

    describe('updateRecord', () => {
      it('sends updateRecord view message', async () => {
        const record = new GitLabChatRecord({ author: 'user', text: 'hello' });

        await view.updateRecord(record);

        expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'updateRecord', record });
      });
    });
  });
});
