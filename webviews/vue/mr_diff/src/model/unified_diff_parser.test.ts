import { parseUnifiedDiff } from './unified_diff_parser';

describe('parseUnifiedDiff', () => {
  it('turns a removed run followed by an added run into one modified block', () => {
    const diff = ['@@ -1,4 +1,4 @@', ' a', '-b', '-c', '+B', ' d', ''].join('\n');

    expect(parseUnifiedDiff(diff)).toEqual([
      { id: 0, kind: 'modified', oldStart: 1, oldCount: 2, newStart: 1, newCount: 1 },
    ]);
  });

  it('recognises inserted and deleted blocks', () => {
    const diff = ['@@ -1,3 +1,3 @@', ' a', '+x', ' b', '-c', '\\ No newline at end of file'].join(
      '\n',
    );

    expect(parseUnifiedDiff(diff)).toEqual([
      { id: 0, kind: 'inserted', oldStart: 1, oldCount: 0, newStart: 1, newCount: 1 },
      { id: 1, kind: 'deleted', oldStart: 2, oldCount: 1, newStart: 3, newCount: 0 },
    ]);
  });

  it('splits an added run followed by a removed run into two blocks', () => {
    const diff = ['@@ -1,2 +1,2 @@', '+x', '-a', ' b'].join('\n');

    expect(parseUnifiedDiff(diff).map(b => b.kind)).toEqual(['inserted', 'deleted']);
  });

  it('positions blocks of later hunks from their headers', () => {
    const diff = [
      '@@ -1,2 +1,3 @@',
      ' a',
      '+x',
      ' b',
      '@@ -20,3 +21,2 @@ function name()',
      ' t',
      '-u',
      ' v',
    ].join('\n');

    expect(parseUnifiedDiff(diff)).toEqual([
      { id: 0, kind: 'inserted', oldStart: 1, oldCount: 0, newStart: 1, newCount: 1 },
      { id: 1, kind: 'deleted', oldStart: 20, oldCount: 1, newStart: 21, newCount: 0 },
    ]);
  });

  it('handles new and deleted files whose header has a zero count', () => {
    expect(parseUnifiedDiff('@@ -0,0 +1,2 @@\n+a\n+b\n')).toEqual([
      { id: 0, kind: 'inserted', oldStart: 0, oldCount: 0, newStart: 0, newCount: 2 },
    ]);
    expect(parseUnifiedDiff('@@ -1 +0,0 @@\n-a\n')).toEqual([
      { id: 0, kind: 'deleted', oldStart: 0, oldCount: 1, newStart: 0, newCount: 0 },
    ]);
  });

  it('returns no blocks for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});
