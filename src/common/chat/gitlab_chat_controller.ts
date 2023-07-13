import * as vscode from 'vscode';
import { GitLabChatRecord } from './gitlab_chat_record';
import { GitLabChatView, IChatController } from './gitlab_chat_view';
import { GitLabPlatformManager } from '../platform/gitlab_platform';

export class GitLabChatController implements IChatController {
  public chatHistory: GitLabChatRecord[];

  public view: GitLabChatView;

  public context: vscode.ExtensionContext;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(context: vscode.ExtensionContext, manager: GitLabPlatformManager) {
    this.chatHistory = [];
    this.context = context;
    this.view = new GitLabChatView(this);
  }

  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  async processNewUserRecord(record: GitLabChatRecord) {
    // implementation will be added in a follow-up MR.
  }
}
