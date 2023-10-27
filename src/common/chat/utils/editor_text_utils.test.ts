import * as vscode from 'vscode';
import { getActiveEditorText, getSelectedText } from './editor_text_utils';
import { createFakePartial } from '../../test_utils/create_fake_partial';

describe('getActiveEditorText', () => {
  it('returns null if there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;

    expect(getActiveEditorText()).toBe(null);
  });

  it('returns document content if there is an active editor', async () => {
    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      document: createFakePartial<vscode.TextDocument>({
        getText: jest.fn().mockReturnValue('editorText'),
      }),
    });

    expect(getActiveEditorText()).toStrictEqual('editorText');
  });
});

describe('getSelectedText', () => {
  it('returns null if there is no active editor', async () => {
    vscode.window.activeTextEditor = undefined;

    expect(getSelectedText()).toBe(null);
  });

  it('returns null if there is no selection', async () => {
    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      selection: undefined,
    });

    expect(getSelectedText()).toBe(null);
  });

  it('returns selection content if there is a selection', async () => {
    const selection = new vscode.Range(0, 0, 0, 3);

    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      selection: createFakePartial<vscode.Selection>({
        start: selection.start,
        end: selection.end,
      }),
      document: createFakePartial<vscode.TextDocument>({
        getText: jest.fn().mockReturnValue('foo'),
      }),
    });

    expect(getSelectedText()).toStrictEqual('foo');
    expect(vscode.window.activeTextEditor.document.getText).toHaveBeenCalledWith(selection);
  });
});
