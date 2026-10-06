import { computeWordDiff } from './word_diff';

describe('computeWordDiff', () => {
  it('highlights only the changed words', () => {
    const result = computeWordDiff(['const value = 1;'], ['const total = 1;'], 3, 4);

    expect(result.old).toEqual([{ line: 3, startColumn: 7, endColumn: 12 }]);
    expect(result.new).toEqual([{ line: 4, startColumn: 7, endColumn: 12 }]);
  });

  it('merges adjacent changed tokens on the same line', () => {
    const result = computeWordDiff(['a(b)'], ['a[b]'], 1, 1);

    expect(result.old).toEqual([
      { line: 1, startColumn: 2, endColumn: 3 },
      { line: 1, startColumn: 4, endColumn: 5 },
    ]);
  });

  it('tracks lines across a multi-line block', () => {
    const result = computeWordDiff(['one', 'two'], ['one', 'three'], 10, 20);

    expect(result.old).toEqual([{ line: 11, startColumn: 1, endColumn: 4 }]);
    expect(result.new).toEqual([{ line: 21, startColumn: 1, endColumn: 6 }]);
  });

  it('gives up on blocks above the cell limit', () => {
    expect(computeWordDiff(['a b c'], ['d e f'], 1, 1, 4)).toEqual({ old: [], new: [] });
  });
});
