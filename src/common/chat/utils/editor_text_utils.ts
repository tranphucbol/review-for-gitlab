import * as vscode from 'vscode';

export const getActiveEditorText = (): string | null => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  return editor.document.getText();
};

export const getSelectedText = (): string | null => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.selection || editor.selection.isEmpty) return null;

  const { selection } = editor;

  const selectionRange = new vscode.Range(
    selection.start.line,
    selection.start.character,
    selection.end.line,
    selection.end.character,
  );

  return editor.document.getText(selectionRange);
};

export const getActiveFileName = (): string | null => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  return vscode.workspace.asRelativePath(editor.document.uri);
};

export const getTextBeforeSelected = (): string | null => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.selection || editor.selection.isEmpty) return null;

  const { selection, document } = editor;
  const { line: lineNum, character: charNum } = selection.start;

  const isFirstCharOnLineSelected = charNum === 0;
  const isFirstLine = lineNum === 0;

  const getEndLine = () => {
    if (isFirstCharOnLineSelected) {
      if (isFirstLine) {
        return lineNum;
      }
      return lineNum - 1;
    }
    return lineNum;
  };

  const getEndChar = () => {
    if (isFirstCharOnLineSelected) {
      if (isFirstLine) {
        return 0;
      }
      return document.lineAt(lineNum - 1).range.end.character;
    }
    return charNum - 1;
  };

  const selectionRange = new vscode.Range(0, 0, getEndLine(), getEndChar());

  return editor.document.getText(selectionRange);
};

export const getTextAfterSelected = (): string | null => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.selection || editor.selection.isEmpty) return null;

  const { selection, document } = editor;
  const { line: lineNum, character: charNum } = selection.end;

  const isLastCharOnLineSelected = charNum === document.lineAt(lineNum).range.end.character;
  const isLastLine = lineNum === document.lineCount;

  const getStartLine = () => {
    if (isLastCharOnLineSelected) {
      if (isLastLine) {
        return lineNum;
      }
      return lineNum + 1;
    }
    return lineNum;
  };

  const getStartChar = () => {
    if (isLastCharOnLineSelected) {
      if (isLastLine) {
        return charNum;
      }
      return 0;
    }
    return charNum + 1;
  };

  const selectionRange = new vscode.Range(
    getStartLine(),
    getStartChar(),
    document.lineCount,
    document.lineAt(document.lineCount - 1).range.end.character,
  );

  return editor.document.getText(selectionRange);
};
