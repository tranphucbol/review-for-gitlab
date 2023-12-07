import * as vscode from 'vscode';
import { GitLabChatController } from '../gitlab_chat_controller';
import { refactorCode } from './refactorCode';
import { createFakePartial } from '../../test_utils/create_fake_partial';

let selectedTextValue: string | null = 'selectedText';
const filenameValue = 'filename';

jest.mock('../utils/editor_text_utils', () => ({
  getSelectedText: jest.fn().mockImplementation(() => selectedTextValue),
  getActiveFileName: jest.fn().mockImplementation(() => filenameValue),
  getTextAfterSelected: jest.fn().mockReturnValue('textAfterSelection'),
  getTextBeforeSelected: jest.fn().mockReturnValue('textBeforeSelection'),
}));

describe('refactor', () => {
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = createFakePartial<GitLabChatController>({
      processNewUserRecord: jest.fn(),
    });
  });

  it('creates new record with selection', async () => {
    selectedTextValue = 'hello';

    await refactorCode(controller);
    expect(controller.processNewUserRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '/refactor',
        role: 'user',
        type: 'refactorCode',
        context: {
          currentFile: {
            selectedText: selectedTextValue,
            fileName: filenameValue,
            contentAboveCursor: 'textBeforeSelection',
            contentBelowCursor: 'textAfterSelection',
          },
        },
      }),
    );
  });

  it('does not create new record if there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;

    await refactorCode(controller);

    expect(controller.processNewUserRecord).not.toHaveBeenCalled;
  });
});
