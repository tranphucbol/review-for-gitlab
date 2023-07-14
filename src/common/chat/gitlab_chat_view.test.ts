import * as vscode from 'vscode';
import { GitLabChatView } from './gitlab_chat_view';
import { GitLabChatRecord } from './gitlab_chat_record';

jest.mock('../utils/wait_for_webview');
jest.mock('../utils/generate_secret', () => ({
  generateSecret: jest.fn().mockReturnValue('123'),
}));

const dummyHTML = 'Foo Bar';

describe('GitLabChatView', () => {
  let context: vscode.ExtensionContext;
  let view: GitLabChatView;
  let webview: vscode.WebviewView;
  const viewProcessCallback = jest.fn();

  beforeEach(() => {
    context = {
      extensionUri: vscode.Uri.file('/foo/bar'),
    } as Partial<vscode.ExtensionContext> as vscode.ExtensionContext;
    webview = {
      webview: {
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
        asWebviewUri: jest.fn().mockImplementation(url => url),
      } as Partial<vscode.Webview> as vscode.Webview,
      onDidDispose: jest.fn(),
      show: jest.fn(),
    } as Partial<vscode.WebviewView> as vscode.WebviewView;

    view = new GitLabChatView(context);
    view.onViewMessage(viewProcessCallback);

    (vscode.workspace.fs.readFile as jest.Mock).mockImplementation(() =>
      Promise.resolve(new TextEncoder().encode(dummyHTML)),
    );
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
      expect(webview.webview.onDidReceiveMessage).toBeCalledWith(expect.any(Function));
      expect(webview.onDidDispose).toBeCalledWith(expect.any(Function), view);
    });

    it('sends focus event', () => {
      expect(webview.webview.postMessage).toBeCalledWith({ eventType: 'focus' });
    });

    it('updates the view with correct html content', async () => {
      const inputHTML = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="img-src vscode-resource: https:; script-src 'nonce-{{nonce}}';">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>GitLab Workflow</title>
          <script type="module" crossorigin src="/gitlab_duo_chat/assets/app.js"></script>
          <link rel="stylesheet" href="/gitlab_duo_chat/assets/index.css">
        </head>
        <body>
          <div id="app"></div>
          
        </body>
      </html>
      `;
      const expectedHTML = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="img-src vscode-resource: https:; script-src 'nonce-123';">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>GitLab Workflow</title>
          <script nonce="123" type="module" crossorigin src="file:///foo/bar/webviews/gitlab_duo_chat/assets/app.js"></script>
          <link rel="stylesheet" href="file:///foo/bar/webviews/gitlab_duo_chat/assets/index.css">
        </head>
        <body>
          <div id="app"></div>
          
        </body>
      </html>
      `;
      (vscode.workspace.fs.readFile as jest.Mock).mockImplementation(() =>
        Promise.resolve(new TextEncoder().encode(inputHTML)),
      );
      await view.resolveWebviewView(webview);
      expect(webview.webview.html).toBe(expectedHTML);
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
