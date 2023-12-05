import * as vscode from 'vscode';
import { GitLabChatController } from '../gitlab_chat_controller';
import { generateTests } from './generate_tests';
import { createFakePartial } from '../../test_utils/create_fake_partial';

let selectedTextValue: string | null = 'selectedText';
const filenameValue = 'filename';

jest.mock('../utils/editor_text_utils', () => ({
  getSelectedText: jest.fn().mockImplementation(() => selectedTextValue),
  getActiveFileName: jest.fn().mockImplementation(() => filenameValue),
  getTextAfterSelected: jest.fn().mockReturnValue('textAfterSelection'),
  getTextBeforeSelected: jest.fn().mockReturnValue('textBeforeSelection'),
}));

describe('generateTests', () => {
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = createFakePartial<GitLabChatController>({
      processNewUserRecord: jest.fn(),
    });
  });

  it('creates new "Generate tests" record with selection', async () => {
    selectedTextValue = 'hello';

    await generateTests(controller);
    expect(controller.processNewUserRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '/tests',
        role: 'user',
        type: 'generateTests',
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

  it('does not create new "Generate tests" record if there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;

    await generateTests(controller);

    expect(controller.processNewUserRecord).not.toHaveBeenCalled;
  });
});
