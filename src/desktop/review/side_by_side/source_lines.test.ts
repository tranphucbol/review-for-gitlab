import { MAX_EDIT_DISTANCE, mapSourceRange } from './source_lines';

const text = (...lines: string[]) => lines.join('\n');
const range = (startLine: number, startColumn: number, endLine: number, endColumn: number) => ({
  startLine,
  startColumn,
  endLine,
  endColumn,
});

describe('mapSourceRange', () => {
  const original = text('one', 'two', 'three', 'four', 'five');

  it('keeps a range in an identical file', () => {
    expect(mapSourceRange(original, original, range(2, 2, 4, 3))).toEqual({
      exact: true,
      range: range(2, 2, 4, 3),
    });
  });

  it('keeps a caret in an identical file', () => {
    expect(mapSourceRange(original, original, range(3, 4, 3, 4))).toEqual({
      exact: true,
      range: range(3, 4, 3, 4),
    });
  });

  it('follows lines inserted above the range', () => {
    const local = text('a', 'b', 'c', 'one', 'two', 'three', 'four', 'five');
    expect(mapSourceRange(original, local, range(2, 1, 3, 6))).toEqual({
      exact: true,
      range: range(5, 1, 6, 6),
    });
  });

  it('ignores CRLF line endings in the local file', () => {
    expect(mapSourceRange(original, original.replace(/\n/g, '\r\n'), range(4, 1, 4, 5))).toEqual({
      exact: true,
      range: range(4, 1, 4, 5),
    });
  });

  it('selects the whole local lines of an edited line', () => {
    const local = text('one', 'two', 'THREE', 'four', 'five');
    expect(mapSourceRange(original, local, range(3, 2, 3, 4))).toEqual({
      exact: false,
      range: range(3, 1, 3, 6),
    });
  });

  it('puts a caret on an edited line at the start of the closest local line', () => {
    const local = text('one', 'two', 'THREE', 'four', 'five');
    expect(mapSourceRange(original, local, range(3, 4, 3, 4))).toEqual({
      exact: false,
      range: range(3, 1, 3, 1),
    });
  });

  it('covers every local line a changed block became', () => {
    const local = text('one', 'TWO', 'two and a half', 'THREE', 'four', 'five');
    expect(mapSourceRange(original, local, range(2, 1, 3, 1 + 'three'.length))).toEqual({
      exact: false,
      range: range(2, 1, 4, 6),
    });
  });

  it('is not exact when lines were inserted inside the range', () => {
    const local = text('one', 'two', 'new', 'three', 'four', 'five');
    expect(mapSourceRange(original, local, range(2, 1, 3, 6))).toEqual({
      exact: false,
      range: range(2, 1, 4, 6),
    });
  });

  it('lands a line removed locally on the line it sat before', () => {
    const local = text('one', 'two', 'four', 'five');
    expect(mapSourceRange(original, local, range(3, 1, 3, 1))).toEqual({
      exact: false,
      range: range(3, 1, 3, 1),
    });
  });

  it('lands a removed last line on the last local line', () => {
    const local = text('one', 'two', 'three', 'four');
    expect(mapSourceRange(original, local, range(5, 1, 5, 5))).toEqual({
      exact: false,
      range: range(4, 1, 4, 5),
    });
  });

  it('does not include the line a selection ends at column 1 of', () => {
    expect(mapSourceRange(original, original, range(2, 1, 4, 1))).toEqual({
      exact: true,
      range: range(2, 1, 3, 6),
    });
  });

  it('maps into an empty local file', () => {
    expect(mapSourceRange(original, '', range(2, 1, 3, 6))).toEqual({
      exact: false,
      range: range(1, 1, 1, 1),
    });
  });

  it('clamps a range past the end of the text', () => {
    expect(mapSourceRange(original, original, range(9, 1, 9, 1)).range.startLine).toBe(5);
  });

  it('follows unchanged lines between edits far apart in a long file', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i}`);
    const from = text(...lines);
    const to = text(...lines.slice(0, 10), 'added', ...lines.slice(10, 4990), 'edited');
    expect(mapSourceRange(from, to, range(2500, 3, 2501, 4))).toEqual({
      exact: true,
      range: range(2501, 3, 2502, 4),
    });
  });

  it('maps through the common prefix and suffix when the middle has too many edits', () => {
    const size = MAX_EDIT_DISTANCE / 2 + 1;
    const middle = (tag: string) => Array.from({ length: size }, (_, i) => `${tag}${i}`);
    const from = text('head', ...middle('a'), 'tail');
    const to = text('head', ...middle('b'), 'tail');
    expect(mapSourceRange(from, to, range(1, 1, 1, 5))).toEqual({
      exact: true,
      range: range(1, 1, 1, 5),
    });
    expect(mapSourceRange(from, to, range(size + 2, 1, size + 2, 5))).toEqual({
      exact: true,
      range: range(size + 2, 1, size + 2, 5),
    });
    expect(mapSourceRange(from, to, range(3, 1, 3, 1)).exact).toBe(false);
  });
});
