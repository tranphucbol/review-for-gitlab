import * as vscode from 'vscode';
import { GitLabChatRecord } from './gitlab_chat_record';
import { GitLabChatView, IChatController } from './gitlab_chat_view';
import { GitLabChatApi } from './gitlab_chat_api';
import { GitLabPlatformManager } from '../platform/gitlab_platform';

export class GitLabChatController implements IChatController {
  public chatHistory: GitLabChatRecord[];

  public view: GitLabChatView;

  public context: vscode.ExtensionContext;

  public api: GitLabChatApi;

  constructor(context: vscode.ExtensionContext, manager: GitLabPlatformManager) {
    this.chatHistory = [];
    this.context = context;
    this.api = new GitLabChatApi(manager);
    this.view = new GitLabChatView(this);
  }

  async processNewUserRecord(record: GitLabChatRecord) {
    await this.addToChat(record);

    const responseRecord = new GitLabChatRecord({
      author: 'gitLabChat',
      text: '...',
      state: 'pending',
    });

    await this.addToChat(responseRecord);

    const { text, requestId } = await this.api.processNewUserPrompt(record.text);

    responseRecord.text = text ?? '';
    responseRecord.state = 'ready';
    responseRecord.requestId = requestId;

    await this.view.updateRecord(responseRecord);
  }

  private async addToChat(record: GitLabChatRecord) {
    this.chatHistory.push(record);
    await this.view.addRecord(record);
  }
}
