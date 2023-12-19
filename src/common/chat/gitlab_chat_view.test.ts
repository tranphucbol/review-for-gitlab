import * as vscode from 'vscode';
import { GitLabChatView } from './gitlab_chat_view';
import { GitLabChatRecord } from './gitlab_chat_record';
import { prepareWebviewSource } from '../utils/webviews/prepare_webview_source';

jest.mock('../utils/webviews/wait_for_webview');
jest.mock('../utils/webviews/prepare_webview_source', () => ({
  prepareWebviewSource: jest.fn().mockReturnValue('preparedWebviewSource'),
}));

describe('GitLabChatView', () => {
  const context = {} as Partial<vscode.ExtensionContext> as vscode.ExtensionContext;
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
      onDidChangeVisibility: jest.fn(),
      show: jest.fn(),
    } as Partial<vscode.WebviewView> as vscode.WebviewView;

    view = new GitLabChatView(context);
    view.onViewMessage(viewProcessCallback);
  });

  describe('resolveWebviewView', () => {
    beforeEach(async () => {
      await view.resolveWebviewView(webview);
    });

    it('updates webview with proper html options', () => {
      expect(webview.webview.options).toEqual({ enableScripts: true });
      expect(webview.webview.html.length).toBeGreaterThan(0);
    });

    it('sets message processing and dispose callbacks', () => {
      expect(webview.webview.onDidReceiveMessage).toHaveBeenCalledWith(expect.any(Function));
      expect(webview.onDidChangeVisibility).toHaveBeenCalledWith(expect.any(Function));
      expect(webview.onDidDispose).toHaveBeenCalledWith(expect.any(Function), view);
    });

    it('sends focus event', () => {
      expect(webview.webview.postMessage).toHaveBeenCalledWith({ eventType: 'focus' });
    });

    it('updates the view with correct html content', async () => {
      await view.resolveWebviewView(webview);
      expect(webview.webview.html).toBe('preparedWebviewSource');
      expect(prepareWebviewSource).toHaveBeenCalledWith(
        webview.webview,
        context,
        'gitlab_duo_chat',
      );
    });
  });

  describe('show', () => {
    it('shows the chatview with focus if it is present', async () => {
      await view.resolveWebviewView(webview);

      await view.show();

      expect(webview.show).toBeCalled();
      expect(webview.webview.postMessage).toHaveBeenCalledWith({ eventType: 'focus' });
    });

    it('executes vscode command if the view is not present', async () => {
      vscode.commands.executeCommand = jest.fn();

      await view.show();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('gl.chatView.focus');
    });
  });

  describe('with webview initialized', () => {
    beforeEach(async () => {
      await view.resolveWebviewView(webview);
    });

    describe('addRecord', () => {
      it('sends newRecord view message', async () => {
        const record = new GitLabChatRecord({ role: 'user', content: 'hello' });

        await view.addRecord(record);

        expect(webview.webview.postMessage).toHaveBeenCalledWith({
          eventType: 'newRecord',
          record,
        });
      });
    });

    describe('updateRecord', () => {
      it('sends updateRecord view message', async () => {
        const record = new GitLabChatRecord({ role: 'user', content: 'hello' });

        await view.updateRecord(record);

        expect(webview.webview.postMessage).toHaveBeenCalledWith({
          eventType: 'updateRecord',
          record,
        });
      });
    });

    describe('cleanChat', () => {
      it('sends `cleanChat` view message', async () => {
        await view.cleanChat();

        expect(webview.webview.postMessage).toHaveBeenCalledWith({ eventType: 'cleanChat' });
      });
    });
  });
});
