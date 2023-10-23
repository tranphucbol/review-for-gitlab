import * as vscode from 'vscode';
import { GitLabChatController } from '../gitlab_chat_controller';
import { explainSelectedCode } from './explain_selected_code';
import { createFakePartial } from '../../test_utils/create_fake_partial';

const mockEditorSelection = (text: string) => {
  vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
    selection: createFakePartial<vscode.Selection>({
      start: createFakePartial<vscode.Position>({ line: 0, character: 0 }),
      end: createFakePartial<vscode.Position>({ line: 0, character: text.length }),
    }),
    document: createFakePartial<vscode.TextDocument>({
      getText: jest.fn().mockReturnValue(text),
    }),
  });
};

describe('explainSelectedCode', () => {
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = createFakePartial<GitLabChatController>({
      processNewUserRecord: jest.fn(),
    });
  });

  it('creates new "Explain this code" record', async () => {
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

  it('does not create new "Explain this code" record if there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;

    await explainSelectedCode(controller);

    expect(controller.processNewUserRecord).not.toHaveBeenCalled;
  });
});
