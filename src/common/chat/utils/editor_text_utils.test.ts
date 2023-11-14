import * as vscode from 'vscode';
import {
  getActiveEditorText,
  getSelectedText,
  getActiveFileName,
  getTextBeforeSelected,
  getTextAfterSelected,
} from './editor_text_utils';
import { createFakePartial } from '../../test_utils/create_fake_partial';

const documentLinesCount = 40;
const documentLastCharacterNumber = 10;

describe('getActiveEditorText', () => {
  it('returns null if there is no active editor', () => {
    vscode.window.activeTextEditor = undefined;

    expect(getActiveEditorText()).toBe(null);
  });

  it('returns document content if there is an active editor', () => {
    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      document: createFakePartial<vscode.TextDocument>({
        getText: jest.fn().mockReturnValue('editorText'),
      }),
    });

    expect(getActiveEditorText()).toStrictEqual('editorText');
  });
});

describe('getSelectedText', () => {
  it('returns null if there is no active editor', () => {
    vscode.window.activeTextEditor = undefined;

    expect(getSelectedText()).toBe(null);
  });

  it('returns null if there is no selection', () => {
    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      selection: undefined,
    });

    expect(getSelectedText()).toBe(null);
  });

  it('returns selection content if there is a selection', () => {
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

describe('getActiveFileName', () => {
  it('returns null if there is no active editor', () => {
    vscode.window.activeTextEditor = undefined;

    expect(getActiveFileName()).toBe(null);
  });

  it('returns the relative path of the currently active document if there is an active editor', () => {
    const relativePath = 'gitlab/foo/bar.rb';
    const fullPath = `/Users/dev/${relativePath}`;

    const asRelativePathMock = jest.fn().mockReturnValue(relativePath);

    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      document: createFakePartial<vscode.TextDocument>({
        uri: fullPath,
      }),
    });
    vscode.workspace.asRelativePath = asRelativePathMock;

    expect(getActiveFileName()).toStrictEqual(relativePath);
    expect(asRelativePathMock).toHaveBeenCalledWith(fullPath);
  });
});

describe('getTextBeforeSelected', () => {
  it('returns null if there is no active editor', () => {
    vscode.window.activeTextEditor = undefined;

    expect(getTextBeforeSelected()).toBe(null);
  });

  it('returns null if there is no selection', () => {
    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      selection: undefined,
    });

    expect(getTextBeforeSelected()).toBe(null);
  });

  it.each`
    selection                          | expectedRange
    ${new vscode.Range(0, 0, 0, 0)}    | ${new vscode.Range(0, 0, 0, 0)}
    ${new vscode.Range(0, 10, 1, 0)}   | ${new vscode.Range(0, 0, 0, 9)}
    ${new vscode.Range(10, 10, 20, 0)} | ${new vscode.Range(0, 0, 10, 9)}
    ${new vscode.Range(10, 0, 40, 0)}  | ${new vscode.Range(0, 0, 9, 10)}
    ${new vscode.Range(10, 5, 40, 6)}  | ${new vscode.Range(0, 0, 10, 4)}
  `('returns correct content before the $selection', ({ selection, expectedRange } = {}) => {
    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      selection: createFakePartial<vscode.Selection>({
        start: selection.start,
      }),
      document: createFakePartial<vscode.TextDocument>({
        getText: jest.fn().mockReturnValue('foo'),
        lineCount: documentLinesCount,
        lineAt: jest.fn().mockReturnValue({
          range: {
            end: {
              character: documentLastCharacterNumber,
            },
          },
        }),
      }),
    });

    getTextBeforeSelected();
    expect(vscode.window.activeTextEditor.document.getText).toHaveBeenCalledWith(expectedRange);
  });
});

describe('getTextAfterSelected', () => {
  it('returns null if there is no active editor', () => {
    vscode.window.activeTextEditor = undefined;

    expect(getTextAfterSelected()).toBe(null);
  });

  it('returns null if there is no selection', () => {
    vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
      selection: undefined,
    });

    expect(getTextAfterSelected()).toBe(null);
  });

  it.each`
    selection                           | expectedRange
    ${new vscode.Range(10, 10, 20, 5)}  | ${new vscode.Range(20, 6, 40, 10)}
    ${new vscode.Range(10, 10, 20, 10)} | ${new vscode.Range(21, 0, 40, 10)}
    ${new vscode.Range(10, 10, 20, 0)}  | ${new vscode.Range(20, 1, 40, 10)}
    ${new vscode.Range(10, 10, 40, 10)} | ${new vscode.Range(40, 10, 40, 10)}
    ${new vscode.Range(10, 10, 40, 0)}  | ${new vscode.Range(40, 1, 40, 10)}
  `(
    'returns correct content after the selection if there is a selection',
    ({ selection, expectedRange } = {}) => {
      vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
        selection: createFakePartial<vscode.Selection>({
          end: selection.end,
        }),
        document: createFakePartial<vscode.TextDocument>({
          getText: jest.fn().mockReturnValue('foo'),
          lineCount: documentLinesCount,
          lineAt: jest.fn().mockReturnValue({
            range: {
              end: {
                character: documentLastCharacterNumber,
              },
            },
          }),
        }),
      });

      getTextAfterSelected();
      expect(vscode.window.activeTextEditor.document.getText).toHaveBeenCalledWith(expectedRange);
    },
  );
});
