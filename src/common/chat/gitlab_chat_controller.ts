import * as vscode from 'vscode';
import { GitLabChatRecord } from './gitlab_chat_record';
import { GitLabChatView, ViewMessage } from './gitlab_chat_view';
import { GitLabChatApi } from './gitlab_chat_api';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { log } from '../log';

export class GitLabChatController implements vscode.WebviewViewProvider {
  readonly chatHistory: GitLabChatRecord[];

  readonly #view: GitLabChatView;

  readonly #api: GitLabChatApi;

  constructor(manager: GitLabPlatformManager, context: vscode.ExtensionContext) {
    this.chatHistory = [];
    this.#api = new GitLabChatApi(manager);
    this.#view = new GitLabChatView(context);
    this.#view.onViewMessage(this.viewMessageHandler.bind(this));
    this.#view.onDidBecomeVisible(this.restoreHistory.bind(this));
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    await this.#view.resolveWebviewView(webviewView);
    await this.restoreHistory();
  }

  async viewMessageHandler(message: ViewMessage) {
    switch (message.eventType) {
      case 'newPrompt': {
        await this.processNewPrompt(message.record.content);
        break;
      }
      default:
        log.warn(`Unhandled chat-webview message ${message.eventType}`);
        break;
    }
  }

  async showChat() {
    await this.#view.show();
  }

  async processNewUserRecord(record: GitLabChatRecord) {
    if (!record.content) return;

    await this.#view.show();

    await this.addToChat(record);

    const responseRecord = new GitLabChatRecord({
      role: 'assistant',
      content: '...',
      state: 'pending',
    });

    await this.addToChat(responseRecord);

    const { content, requestId, errors } = await this.#api.processNewUserPrompt(record.content);

    responseRecord.content = content;
    responseRecord.errors = errors;
    responseRecord.requestId = requestId;
    responseRecord.state = 'ready';

    await this.#view.updateRecord(responseRecord);
  }

  private async restoreHistory() {
    this.chatHistory.forEach(async record => {
      await this.#view.addRecord(record);
    }, this);
  }

  private async processNewPrompt(promptText: string) {
    const record = new GitLabChatRecord({ role: 'user', content: promptText });

    await this.processNewUserRecord(record);
  }

  private async addToChat(record: GitLabChatRecord) {
    this.chatHistory.push(record);
    await this.#view.addRecord(record);
  }
}
