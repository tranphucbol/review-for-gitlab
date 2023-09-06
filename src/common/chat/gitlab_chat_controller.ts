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
        const record = new GitLabChatRecord({ role: 'user', content: message.record.content });

        await this.processNewUserRecord(record);
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

    await this.sendNewPrompt(record);
    await this.addToChat(record);

    switch (record.type) {
      case 'newConversation': {
        // do nothing.
        break;
      }
      default: {
        const responseRecord = new GitLabChatRecord({
          role: 'assistant',
          content: '...',
          state: 'pending',
        });

        await this.addToChat(responseRecord);

        if (!record.requestId) {
          break;
        }

        const response = await this.#api.pullAiMessage(record.requestId);

        if (response.type !== 'error') {
          responseRecord.content = response.content;
          responseRecord.setTimestamp(response.timestamp);
        }

        responseRecord.errors = response.errors;
        responseRecord.requestId = response.requestId;
        responseRecord.state = 'ready';

        await this.#view.updateRecord(responseRecord);
      }
    }
  }

  private async restoreHistory() {
    this.chatHistory.forEach(async record => {
      await this.#view.addRecord(record);
    }, this);
  }

  private async addToChat(record: GitLabChatRecord) {
    this.chatHistory.push(record);
    await this.#view.addRecord(record);
  }

  private async sendNewPrompt(record: GitLabChatRecord) {
    if (!record.content) throw new Error('Trying to send prompt without content.');

    const actionResponse = await this.#api.processNewUserPrompt(record.content);

    // eslint-disable-next-line no-param-reassign
    record.requestId = actionResponse.aiAction.requestId;
    // eslint-disable-next-line no-param-reassign
    record.errors = actionResponse.aiAction.errors;
  }
}
