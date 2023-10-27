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
