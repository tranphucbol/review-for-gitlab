import { computeLineBlocks, splitLines } from './line_alignment';

describe('splitLines', () => {
  it('splits on LF and CRLF', () => {
    expect(splitLines('a\r\nb\nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('computeLineBlocks', () => {
  it('returns no blocks for equal texts', () => {
    expect(computeLineBlocks(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('finds modified, inserted and deleted blocks', () => {
    const oldLines = ['a', 'b', 'c', 'd', 'e'];
    const newLines = ['a', 'B', 'c', 'x', 'd'];

    expect(computeLineBlocks(oldLines, newLines)).toEqual([
      { id: 0, kind: 'modified', oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 },
      { id: 1, kind: 'inserted', oldStart: 3, oldCount: 0, newStart: 3, newCount: 1 },
      { id: 2, kind: 'deleted', oldStart: 4, oldCount: 1, newStart: 5, newCount: 0 },
    ]);
  });

  it('makes the middle one block when it exceeds the cell limit', () => {
    const oldLines = ['same', 'a', 'b', 'c', 'end'];
    const newLines = ['same', 'x', 'b', 'y', 'end'];

    expect(computeLineBlocks(oldLines, newLines, 8)).toEqual([
      { id: 0, kind: 'modified', oldStart: 1, oldCount: 3, newStart: 1, newCount: 3 },
    ]);
  });

  it('handles one side being empty', () => {
    expect(computeLineBlocks([], ['a', 'b'])).toEqual([
      { id: 0, kind: 'inserted', oldStart: 0, oldCount: 0, newStart: 0, newCount: 2 },
    ]);
  });
});
