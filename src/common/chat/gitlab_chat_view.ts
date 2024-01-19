import * as vscode from 'vscode';
import { GitLabChatRecord } from './gitlab_chat_record';
import { waitForWebview } from '../utils/webviews/wait_for_webview';
import { log } from '../log';
import { prepareWebviewSource } from '../utils/webviews/prepare_webview_source';

export const CHAT_SIDEBAR_VIEW_ID = 'gl.chatView';

interface FocusCommand {
  eventType: 'focus';
}

interface RecordCommand {
  eventType: 'newRecord' | 'updateRecord';
  record: GitLabChatRecord;
}

interface CleanChatCommand {
  eventType: 'cleanChat';
}

export type ViewCommand = FocusCommand | RecordCommand | CleanChatCommand;

interface CleanChatMessage {
  eventType: 'cleanChat';
}

interface NewPromptMessage {
  eventType: 'newPrompt';
  record: {
    content: string;
  };
}

interface FeedbackMessage {
  eventType: 'trackFeedback';
  data?: {
    extendedTextFeedback: string | null;
    feedbackChoices: Array<string> | null;
  };
}

export type ViewEmittedMessage = NewPromptMessage | FeedbackMessage | CleanChatMessage;

export class GitLabChatView {
  #context: vscode.ExtensionContext;

  #chatView?: vscode.WebviewView;

  #messageEmitter = new vscode.EventEmitter<ViewEmittedMessage>();

  onViewMessage = this.#messageEmitter.event;

  #visibilityEmitter = new vscode.EventEmitter<void>();

  onDidBecomeVisible = this.#visibilityEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.#context = context;
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.#chatView = webviewView;

    this.#chatView.webview.options = {
      enableScripts: true,
    };

    this.#chatView.webview.html = await prepareWebviewSource(
      this.#chatView.webview,
      this.#context,
      'gitlab_duo_chat',
    );

    await waitForWebview(this.#chatView.webview);

    this.#chatView.webview.onDidReceiveMessage(m => this.#messageEmitter.fire(m));
    this.#chatView.onDidChangeVisibility(() => {
      if (this.#chatView?.visible) this.#visibilityEmitter.fire();
    });

    this.#chatView.onDidDispose(() => {
      this.#chatView = undefined;
    }, this);

    await this.focusInput();
  }

  async show() {
    if (this.#chatView) {
      if (!this.#chatView.visible) {
        this.#chatView.show();
        await waitForWebview(this.#chatView.webview);
      }
    } else {
      await vscode.commands.executeCommand(`${CHAT_SIDEBAR_VIEW_ID}.focus`);
    }

    await this.focusInput();
  }

  async cleanChat() {
    await this.sendChatViewCommand({ eventType: 'cleanChat' });
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
}
