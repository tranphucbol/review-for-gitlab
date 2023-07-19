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
      controller.view.addRecord = jest.fn();
      controller.view.updateRecord = jest.fn();
      controller.api.processNewUserPrompt = jest
        .fn()
        .mockReturnValue({ text: 'api response', requestId: 'uniqueId' });

      record = new GitLabChatRecord({ author: 'user', text: 'hello' });
    });

    describe('before the api call', () => {
      beforeEach(() => {
        controller.api.processNewUserPrompt = jest.fn(() => {
          throw new Error('asd');
        });
      });

      it('sends new user record and pending response record to the view before the API call', async () => {
        try {
          await controller.processNewUserRecord(record);
        } catch (e) {
          /* empty */
        }

        expect(controller.view.addRecord).toHaveBeenNthCalledWith(1, record);
        expect(controller.view.addRecord).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ text: '...', state: 'pending', author: 'gitLabChat' }),
        );
      });

      it('fills history array', async () => {
        expect(controller.chatHistory).toEqual([]);

        try {
          await controller.processNewUserRecord(record);
        } catch (e) {
          /* empty */
        }

        expect(controller.chatHistory[0]).toEqual(record);
        expect(controller.chatHistory[1]).toEqual(
          expect.objectContaining({ text: '...', state: 'pending', author: 'gitLabChat' }),
        );
      });
    });

    it('sends update of the view when API response is received', async () => {
      await controller.processNewUserRecord(record);

      expect(controller.view.addRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'api response',
          state: 'ready',
          author: 'gitLabChat',
          requestId: 'uniqueId',
        }),
      );
    });

    it('fills updated history', async () => {
      expect(controller.chatHistory).toEqual([]);

      await controller.processNewUserRecord(record);

      expect(controller.chatHistory[0]).toEqual(record);
      expect(controller.chatHistory[1]).toEqual(
        expect.objectContaining({
          text: 'api response',
          state: 'ready',
          author: 'gitLabChat',
          requestId: 'uniqueId',
        }),
      );
    });
  });
});
