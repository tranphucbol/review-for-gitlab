/** Where an element sits for VS Code's webview context menu, read from `data-vscode-context`. */
export type WebviewSection = 'diffPane' | 'diffThread' | 'diffFiller';

/** Marks `element` so that the `webview/context` items for `section` show on a right-click in it. */
export const setWebviewSection = (element: HTMLElement, section: WebviewSection) => {
  // eslint-disable-next-line no-param-reassign
  element.dataset.vscodeContext = JSON.stringify({ webviewSection: section });
};

interface LineRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface LinePosition {
  lineNumber: number;
  column: number;
}

/**
 * Whether a right-click at `position` keeps the selection, as in a VS Code editor: a click
 * inside a non-empty selection keeps it for the context menu, any other click moves the cursor.
 */
export const rightClickKeepsSelection = (selection: LineRange, position: LinePosition): boolean => {
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection;
  if (startLineNumber === endLineNumber && startColumn === endColumn) return false;
  const { lineNumber, column } = position;
  if (lineNumber < startLineNumber || lineNumber > endLineNumber) return false;
  if (lineNumber === startLineNumber && column < startColumn) return false;
  if (lineNumber === endLineNumber && column > endColumn) return false;
  return true;
};
