import * as vscode from 'vscode';
import { GitLabChatController } from './gitlab_chat_controller';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabChatRecord } from './gitlab_chat_record';

describe('GitLabChatController', () => {
  let context: vscode.ExtensionContext;
  let platformManager: GitLabPlatformManager;
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = new GitLabChatController(context, platformManager);
  });

  describe('processNewUserRecord', () => {
    let record: GitLabChatRecord;

    beforeEach(() => {
      record = new GitLabChatRecord({ author: 'user', text: 'hello' });
    });

    it('does nothing for now', async () => {
      await controller.processNewUserRecord(record);
    });
  });
});
