import * as vscode from 'vscode';
import { GitLabChatController } from '../gitlab_chat_controller';
import { explainSelectedCode } from './explain_selected_code';
import { createFakePartial } from '../../test_utils/create_fake_partial';

let selectedTextValue: string | null = 'selectedText';
const filenameValue = 'filename';

jest.mock('../utils/editor_text_utils', () => ({
  getSelectedText: jest.fn().mockImplementation(() => selectedTextValue),
  getActiveFileName: jest.fn().mockImplementation(() => filenameValue),
  getTextAfterSelected: jest.fn().mockReturnValue('textAfterSelection'),
  getTextBeforeSelected: jest.fn().mockReturnValue('textBeforeSelection'),
}));

describe('explainSelectedCode', () => {
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = createFakePartial<GitLabChatController>({
      processNewUserRecord: jest.fn(),
    });
  });

  it('creates new "Explain this code" record', async () => {
    selectedTextValue = 'hello';

    await explainSelectedCode(controller);

    expect(controller.processNewUserRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Explain selected code',
        role: 'user',
        type: 'explainCode',
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

  it('does not create new "Explain this code" record if there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;

    await explainSelectedCode(controller);

    expect(controller.processNewUserRecord).not.toHaveBeenCalled;
  });
});
