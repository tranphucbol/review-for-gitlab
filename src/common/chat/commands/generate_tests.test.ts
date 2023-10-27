import * as vscode from 'vscode';
import { GitLabChatController } from '../gitlab_chat_controller';
import { generateTests } from './generate_tests';
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

describe('generateTests', () => {
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = createFakePartial<GitLabChatController>({
      processNewUserRecord: jest.fn(),
    });
  });

  it('creates new "Generate tests" record with selection', async () => {
    mockEditorSelection('hello');

    await generateTests(controller);
    expect(controller.processNewUserRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Write tests for this code\n\n```\nhello\n```',
        role: 'user',
        type: 'generateTests',
        payload: {
          editorText: 'hello',
        },
      }),
    );
  });

  it('does not create new "Generate tests" record if there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;

    await generateTests(controller);

    expect(controller.processNewUserRecord).not.toHaveBeenCalled;
  });

  it('creates new "Generate tests" record with entire editor content if there is no selection', async () => {
    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      selection: undefined,
      document: createFakePartial<vscode.TextDocument>({
        getText: jest.fn().mockReturnValue('hello world'),
      }),
    });

    await generateTests(controller);
    expect(controller.processNewUserRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Write tests for this code\n\n```\nhello world\n```',
        role: 'user',
        type: 'generateTests',
        payload: {
          editorText: 'hello world',
        },
      }),
    );
  });
});
