import * as vscode from 'vscode';
import { GitLabChatRecord } from './gitlab_chat_record';
import { waitForWebview } from '../utils/wait_for_webview';
import { generateSecret } from '../utils/generate_secret';
import { log } from '../log';

export const CHAT_SIDEBAR_VIEW_ID = 'gl.chatView';

const webviewResourcePaths = {
  appScriptUri: 'webviews/gitlab_duo_chat/assets/app.js',
  styleUri: 'webviews/gitlab_duo_chat/assets/index.css',
} as const;

type WebviewResources = Record<keyof typeof webviewResourcePaths, vscode.Uri>;

interface FocusCommand {
  eventType: 'focus';
}

interface RecordCommand {
  eventType: 'newRecord' | 'updateRecord';
  record: GitLabChatRecord;
}

export type ViewCommand = FocusCommand | RecordCommand;

interface NewPromptMessage {
  eventType: 'newPrompt';
  record: {
    text: string;
  };
}

export type ViewMessage = NewPromptMessage;

export class GitLabChatView {
  #context: vscode.ExtensionContext;

  #chatView?: vscode.WebviewView;

  #messageEmitter = new vscode.EventEmitter<ViewMessage>();

  onViewMessage = this.#messageEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.#context = context;
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.#chatView = webviewView;

    this.#chatView.webview.options = {
      enableScripts: true,
    };

    this.#chatView.webview.html = await this.getViewSource();

    await waitForWebview(this.#chatView.webview);

    this.#chatView.webview.onDidReceiveMessage(m => this.#messageEmitter.fire(m));

    this.#chatView.onDidDispose(() => {
      this.#chatView = undefined;
    }, this);

    await this.focusInput();
  }

  async show() {
    if (this.#chatView) {
      this.#chatView.show();
    } else {
      await vscode.commands.executeCommand(`${CHAT_SIDEBAR_VIEW_ID}.focus`);
    }

    await this.focusInput();
  }

  async addRecord(record: GitLabChatRecord) {
    await this.sendChatViewCommand({
      eventType: 'newRecord',
      record,
    });
  }

  async updateRecord(record: GitLabChatRecord) {
    await this.sendChatViewCommand({
      eventType: 'updateRecord',
      record,
    });
  }

  private async focusInput() {
    await this.sendChatViewCommand({ eventType: 'focus' });
  }

  private async sendChatViewCommand(message: ViewCommand) {
    if (!this.#chatView) {
      log.warn('Trying to send webview chat message without a webview.');
      return;
    }

    await this.#chatView.webview.postMessage(message);
  }

  private getResources(): WebviewResources {
    return Object.entries(webviewResourcePaths).reduce((acc, [key, value]) => {
      if (!this.#chatView) return acc;
      const segments = value.split('/');
      const uri = vscode.Uri.joinPath(this.#context.extensionUri, ...segments);
      return { ...acc, [key]: this.#chatView.webview.asWebviewUri(uri) };
    }, {}) as WebviewResources;
  }

  private async getViewSource(): Promise<string> {
    if (!this.#chatView)
      return new Promise<string>(resolve => {
        resolve('');
      });
    const nonce = generateSecret();

    const { appScriptUri, styleUri } = this.getResources();
    const fileUri = vscode.Uri.joinPath(
      this.#context.extensionUri,
      'webviews',
      'gitlab_duo_chat',
      'index.html',
    );
    const contentArray = await vscode.workspace.fs.readFile(fileUri);
    const fileContent = new TextDecoder().decode(contentArray);

    return fileContent
      .replace(/{{nonce}}/gm, nonce)
      .replace(/<script /g, `<script nonce="${nonce}" `)
      .replace('/gitlab_duo_chat/assets/index.css', styleUri.toString())
      .replace('/gitlab_duo_chat/assets/app.js', appScriptUri.toString());
  }
}
