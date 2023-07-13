import * as vscode from 'vscode';
import { GitLabChatRecord } from './gitlab_chat_record';
import { waitForWebview } from '../utils/wait_for_webview';

export const CHAT_SIDEBAR_VIEW_ID = 'gl.chatView';

interface ChatViewMessage {
  eventType: string;
  text?: string;
  record?: GitLabChatRecord;
}

export interface IChatController {
  processNewUserRecord(record: GitLabChatRecord): void;
  chatHistory: GitLabChatRecord[];
  context: vscode.ExtensionContext;
}

export class GitLabChatView implements vscode.WebviewViewProvider {
  private chatView?: vscode.WebviewView;

  private controller: IChatController;

  constructor(controller: IChatController) {
    this.controller = controller;
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.chatView = webviewView;

    this.chatView.webview.options = {
      enableScripts: true,
    };

    this.chatView.webview.html = this.getViewSource();

    await waitForWebview(this.chatView.webview);

    this.chatView.webview.onDidReceiveMessage(this.handleChatViewMessage, this);

    this.chatView.onDidDispose(() => {
      this.chatView = undefined;
    }, this);

    this.controller.chatHistory.forEach(this.addRecord, this);

    await this.focusInput();
  }

  async show() {
    if (this.chatView) {
      this.chatView.show();
    } else {
      await vscode.commands.executeCommand(`${CHAT_SIDEBAR_VIEW_ID}.focus`);
    }

    await this.focusInput();
  }

  async addRecord(record: GitLabChatRecord) {
    await this.sendChatViewMessage({
      eventType: record.author === 'user' ? 'newPrompt' : 'newResponse',
      record,
    });
  }

  async updateRecord(record: GitLabChatRecord) {
    await this.sendChatViewMessage({
      eventType: 'updateRecord',
      record,
    });
  }

  private async focusInput() {
    await this.sendChatViewMessage({ eventType: 'focus' });
  }

  private async handleChatViewMessage(message: ChatViewMessage) {
    if (message.eventType !== 'newPrompt' || !message.text) return;

    const record = new GitLabChatRecord({ author: 'user', text: message.text });

    await this.controller.processNewUserRecord(record);
  }

  private async sendChatViewMessage(message: ChatViewMessage) {
    if (!this.chatView) return;

    await this.chatView.webview.postMessage(message);
  }

  // eslint-disable-next-line class-methods-use-this
  private getViewSource(): string {
    return `<html><body>Chat Window HTML code.</body></html>`;
  }
}
