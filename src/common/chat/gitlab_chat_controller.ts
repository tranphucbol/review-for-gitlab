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

  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
  async processNewUserRecord(record: GitLabChatRecord) {
    // implementation will be added in a follow-up MR.
  }
}
