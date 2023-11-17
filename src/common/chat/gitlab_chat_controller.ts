import * as vscode from 'vscode';
import { GitLabChatRecord } from './gitlab_chat_record';
import { GitLabChatView, ViewEmittedMessage } from './gitlab_chat_view';
import { GitLabChatApi } from './gitlab_chat_api';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { log } from '../log';
import { submitFeedback } from './utils/submit_feedback';

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

  async viewMessageHandler(message: ViewEmittedMessage) {
    switch (message.eventType) {
      case 'newPrompt': {
        const record = GitLabChatRecord.buildWithContext({
          role: 'user',
          content: message.record.content,
        });

        await this.processNewUserRecord(record);
        break;
      }
      case 'trackFeedback': {
        if (message.data) {
          await submitFeedback(message.data.extendedTextFeedback, message.data.feedbackChoices);
        }

        break;
      }
      default:
        log.warn(`Unhandled chat-webview message`);
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

    if (record.errors.length > 0) {
      await vscode.window.showErrorMessage(record.errors[0]);
      return;
    }

    await this.addToChat(record);

    switch (record.type) {
      case 'newConversation': {
        // do nothing.
        break;
      }
      default: {
        const responseRecord = new GitLabChatRecord({
          role: 'assistant',
          state: 'pending',
          requestId: record.requestId,
        });
        await this.addToChat(responseRecord);

        await Promise.all([this.refreshRecord(record), this.refreshRecord(responseRecord)]);
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

    await this.#api
      .processNewUserPrompt(record.content, record.context?.currentFile)
      .then(actionResponse => {
        record.update(actionResponse.aiAction);
      })
      .catch(err => {
        record.update({ errors: [`API error: ${err.response.errors[0].message}`] });
      });
  }

  private async refreshRecord(record: GitLabChatRecord) {
    if (!record.requestId) {
      throw Error('requestId must be present!');
    }

    const apiResponse = await this.#api.pullAiMessage(record.requestId, record.role);

    if (apiResponse.type !== 'error') {
      record.update({
        content: apiResponse.content,
        contentHtml: apiResponse.contentHtml,
        extras: apiResponse.extras,
        timestamp: apiResponse.timestamp,
        errors: apiResponse.errors,
      });
    }

    record.update({ errors: apiResponse.errors, state: 'ready' });
    await this.#view.updateRecord(record);
  }
}
