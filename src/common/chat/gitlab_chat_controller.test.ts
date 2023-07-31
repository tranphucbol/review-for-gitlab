import * as vscode from 'vscode';
import { GitLabChatController } from './gitlab_chat_controller';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabChatRecord } from './gitlab_chat_record';

const apiMock = { processNewUserPrompt: jest.fn() };

jest.mock('./gitlab_chat_api', () => ({
  GitLabChatApi: jest.fn().mockImplementation(() => apiMock),
}));

const viewMock = {
  addRecord: jest.fn(),
  updateRecord: jest.fn(),
  show: jest.fn(),
  onViewMessage: jest.fn(),
  onDidBecomeVisible: jest.fn(),
  resolveWebviewView: jest.fn(),
};

jest.mock('./gitlab_chat_view', () => ({
  GitLabChatView: jest.fn().mockImplementation(() => viewMock),
}));

describe('GitLabChatController', () => {
  let platformManager: GitLabPlatformManager;
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = new GitLabChatController(platformManager, {} as vscode.ExtensionContext);
    apiMock.processNewUserPrompt = jest
      .fn()
      .mockReturnValue({ content: 'api response', requestId: 'uniqueId' });
  });

  describe('resolveWebviewView', () => {
    const webview = {} as Partial<vscode.WebviewView> as vscode.WebviewView;

    it('delegates to view', async () => {
      await controller.resolveWebviewView(webview);

      expect(viewMock.resolveWebviewView).toHaveBeenCalledWith(webview);
    });

    it('restores chat history', async () => {
      controller.chatHistory.push(
        new GitLabChatRecord({ role: 'user', content: 'ping' }),
        new GitLabChatRecord({ role: 'assistant', content: 'pong' }),
      );

      await controller.resolveWebviewView(webview);

      expect(viewMock.addRecord).toHaveBeenNthCalledWith(1, controller.chatHistory[0]);
      expect(viewMock.addRecord).toHaveBeenNthCalledWith(2, controller.chatHistory[1]);
    });
  });

  describe('processNewUserRecord', () => {
    let record: GitLabChatRecord;

    beforeEach(() => {
      record = new GitLabChatRecord({ role: 'user', content: 'hello' });
    });

    describe('before the api call', () => {
      beforeEach(() => {
        apiMock.processNewUserPrompt = jest.fn(() => {
          throw new Error('asd');
        });
      });

      it('shows the view', async () => {
        try {
          await controller.processNewUserRecord(record);
        } catch (e) {
          /* empty */
        }

        expect(viewMock.show).toHaveBeenCalled();
      });

      it('sends new user record and pending response record to the view before the API call', async () => {
        try {
          await controller.processNewUserRecord(record);
        } catch (e) {
          /* empty */
        }

        expect(viewMock.addRecord).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ content: 'hello', state: 'ready', role: 'user' }),
        );
        expect(viewMock.addRecord).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ content: '...', state: 'pending', role: 'assistant' }),
        );
      });

      it('fills history array', async () => {
        expect(controller.chatHistory).toEqual([]);

        try {
          await controller.processNewUserRecord(record);
        } catch (e) {
          /* empty */
        }

        expect(controller.chatHistory[0]).toEqual(
          expect.objectContaining({ content: 'hello', state: 'ready', role: 'user' }),
        );
        expect(controller.chatHistory[1]).toEqual(
          expect.objectContaining({ content: '...', state: 'pending', role: 'assistant' }),
        );
      });
    });

    it('sends update of the view when API response is received', async () => {
      await controller.processNewUserRecord(record);

      expect(viewMock.addRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'api response',
          state: 'ready',
          role: 'assistant',
          requestId: 'uniqueId',
        }),
      );
    });

    it('fills updated history', async () => {
      expect(controller.chatHistory).toEqual([]);

      await controller.processNewUserRecord(record);

      expect(controller.chatHistory[0]).toEqual(
        expect.objectContaining({
          content: 'hello',
          state: 'ready',
          role: 'user',
        }),
      );
      expect(controller.chatHistory[1]).toEqual(
        expect.objectContaining({
          content: 'api response',
          state: 'ready',
          role: 'assistant',
          requestId: 'uniqueId',
        }),
      );
    });
  });
});
