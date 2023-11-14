import * as vscode from 'vscode';
import { GitLabChatController } from './gitlab_chat_controller';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabChatRecord } from './gitlab_chat_record';
import { GitLabChatFileContext } from './gitlab_chat_file_context';
import { submitFeedback } from './utils/submit_feedback';

const apiMock = { processNewUserPrompt: jest.fn(), pullAiMessage: jest.fn() };

jest.mock('./gitlab_chat_api', () => ({
  GitLabChatApi: jest.fn().mockImplementation(() => apiMock),
}));

jest.mock('./utils/submit_feedback', () => ({
  submitFeedback: jest.fn(),
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
    apiMock.processNewUserPrompt = jest.fn().mockReturnValue({
      aiAction: {
        errors: [],
        requestId: 'uniqueId',
      },
    });

    apiMock.pullAiMessage = jest.fn().mockImplementation((requestId: string, role: string) => ({
      content: `api response ${role}`,
      contentHtml: `html api response ${role}`,
      role,
      requestId,
      timestamp: '2023-01-01 01:01:01',
      extras: { sources: ['foo'] },
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    });

    it('adds both the user prompt and the temporary assistant record', async () => {
      await controller.processNewUserRecord(record);

      expect(viewMock.addRecord).toHaveBeenCalledTimes(2);
      expect(viewMock.addRecord.mock.calls[0][0]).toEqual(record);
      expect(viewMock.addRecord.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          role: 'assistant',
          requestId: 'uniqueId',
          timestamp: Date.parse('2023-01-01 01:01:01'),
        }),
      );
    });

    it('sends updates of the view when API response is received', async () => {
      await controller.processNewUserRecord(record);

      expect(viewMock.updateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'api response user',
          contentHtml: 'html api response user',
          state: 'ready',
          role: 'user',
          requestId: 'uniqueId',
          timestamp: Date.parse('2023-01-01 01:01:01'),
        }),
      );
    });

    it('fills updated history', async () => {
      expect(controller.chatHistory).toEqual([]);

      await controller.processNewUserRecord(record);

      expect(controller.chatHistory[0]).toEqual(
        expect.objectContaining({
          content: 'api response user',
          contentHtml: 'html api response user',
          state: 'ready',
          role: 'user',
          requestId: 'uniqueId',
        }),
      );
      expect(controller.chatHistory[1]).toEqual(
        expect.objectContaining({
          content: 'api response assistant',
          contentHtml: 'html api response assistant',
          state: 'ready',
          role: 'assistant',
          requestId: 'uniqueId',
          extras: { sources: ['foo'] },
        }),
      );
    });

    it('does not change record timestamp when api returns an error', async () => {
      const timestampBefore = record.timestamp;

      apiMock.pullAiMessage = jest.fn(() => ({
        type: 'error',
        errors: ['timeout'],
        requestId: 'requestId',
        role: 'system',
      }));

      await controller.processNewUserRecord(record);

      expect(record.timestamp).toStrictEqual(timestampBefore);
    });

    describe('with newChatConversation command', () => {
      beforeEach(() => {
        record = new GitLabChatRecord({ role: 'user', content: '/reset' });
      });

      it('sends only new user record and doesnt wait for response', async () => {
        await controller.processNewUserRecord(record);

        expect(viewMock.addRecord).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ content: '/reset', state: 'ready', role: 'user' }),
        );
        expect(viewMock.addRecord).toHaveBeenCalledTimes(1);

        expect(controller.chatHistory[0]).toEqual(
          expect.objectContaining({
            content: '/reset',
            state: 'ready',
            role: 'user',
            type: 'newConversation',
          }),
        );
        expect(controller.chatHistory.length).toEqual(1);
      });
    });

    describe('without active file context', () => {
      it('does not send along the active file context', async () => {
        record = new GitLabChatRecord({ role: 'user', content: '/test' });

        jest.spyOn(GitLabChatFileContext, 'forActiveFile').mockReturnValue(null);

        await controller.processNewUserRecord(record);

        expect(apiMock.processNewUserPrompt).toHaveBeenCalledWith('/test', null);
      });
    });

    describe('with active file context', () => {
      it('sends along the active file context', async () => {
        record = new GitLabChatRecord({ role: 'user', content: '/test' });

        const fileContext = new GitLabChatFileContext({
          fileName: 'foo.rb',
          selectedText: 'selected_text',
          contentAboveCursor: 'before_text',
          contentBelowCursor: 'after_text',
        });

        jest.spyOn(GitLabChatFileContext, 'forActiveFile').mockReturnValue(fileContext);

        await controller.processNewUserRecord(record);

        expect(apiMock.processNewUserPrompt).toHaveBeenCalledWith('/test', fileContext);
      });
    });
  });

  describe('viewMessageHandler', () => {
    describe('supports trackFeedback events', () => {
      it('calls submitFeedback when data is present', async () => {
        await controller.viewMessageHandler({
          eventType: 'trackFeedback',
          data: {
            extendedTextFeedback: 'free text',
            feedbackChoices: ['choice1', 'choice2'],
          },
        });

        expect(submitFeedback).toHaveBeenCalledWith('free text', ['choice1', 'choice2']);
      });

      it('does not call submitFeedback when no data is present', async () => {
        await controller.viewMessageHandler({
          eventType: 'trackFeedback',
        });

        expect(submitFeedback).not.toHaveBeenCalled();
      });
    });

    describe('supports newPrompt events', () => {
      it('processes new record', async () => {
        controller.processNewUserRecord = jest.fn();

        await controller.viewMessageHandler({
          eventType: 'newPrompt',
          record: {
            content: 'hello',
          },
        });

        expect(controller.processNewUserRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            content: 'hello',
          }),
        );
      });
    });
  });
});
