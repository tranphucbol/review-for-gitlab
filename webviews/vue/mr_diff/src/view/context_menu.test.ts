import { describe, expect, it } from 'vitest';
import { rightClickKeepsSelection, setWebviewSection } from './context_menu';

const selection = (
  startLineNumber: number,
  startColumn: number,
  endLineNumber: number,
  endColumn: number,
) => ({ startLineNumber, startColumn, endLineNumber, endColumn });

describe('rightClickKeepsSelection', () => {
  it('moves an empty selection to the click', () => {
    expect(rightClickKeepsSelection(selection(3, 4, 3, 4), { lineNumber: 3, column: 4 })).toBe(
      false,
    );
  });

  it('keeps a selection clicked inside', () => {
    const lines = selection(2, 5, 4, 3);
    expect(rightClickKeepsSelection(lines, { lineNumber: 3, column: 1 })).toBe(true);
    expect(rightClickKeepsSelection(lines, { lineNumber: 2, column: 5 })).toBe(true);
    expect(rightClickKeepsSelection(lines, { lineNumber: 4, column: 3 })).toBe(true);
  });

  it('moves a selection clicked outside', () => {
    const lines = selection(2, 5, 4, 3);
    expect(rightClickKeepsSelection(lines, { lineNumber: 1, column: 1 })).toBe(false);
    expect(rightClickKeepsSelection(lines, { lineNumber: 2, column: 4 })).toBe(false);
    expect(rightClickKeepsSelection(lines, { lineNumber: 4, column: 4 })).toBe(false);
    expect(rightClickKeepsSelection(lines, { lineNumber: 5, column: 1 })).toBe(false);
  });
});

describe('setWebviewSection', () => {
  it('writes the section where VS Code reads it', () => {
    const element = document.createElement('div');
    setWebviewSection(element, 'diffPane');
    expect(JSON.parse(element.getAttribute('data-vscode-context') ?? '')).toEqual({
      webviewSection: 'diffPane',
    });
  });
});
