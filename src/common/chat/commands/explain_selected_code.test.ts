import * as vscode from 'vscode';
import { GitLabChatController } from '../gitlab_chat_controller';
import { explainSelectedCode } from './explain_selected_code';

const mockEditorSelection = (text: string) => {
  vscode.window.activeTextEditor = {
    selection: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    },
    document: {
      getText: jest.fn().mockReturnValue(text),
    },
  } as unknown as Partial<vscode.TextEditor> as vscode.TextEditor;
};

describe('explainSelectedCode', () => {
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = {
      processNewUserRecord: jest.fn(),
    } as unknown as Partial<GitLabChatController> as GitLabChatController;
  });

  it('triggers new "Explain this code" record', async () => {
    mockEditorSelection('hello');

    await explainSelectedCode(controller);
    expect(controller.processNewUserRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Explain this code\n\n```\nhello\n```',
        role: 'user',
        type: 'explainCode',
        payload: {
          selectedText: 'hello',
        },
      }),
    );
  });
});
