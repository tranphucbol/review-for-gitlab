import type { BlockKind, DiffBlock } from './types';

export const LINE_LCS_CELL_LIMIT = 250_000;

export const splitLines = (text: string): string[] => text.split(/\r?\n/);

const kindOf = (oldCount: number, newCount: number): BlockKind => {
  if (oldCount === 0) return 'inserted';
  if (newCount === 0) return 'deleted';
  return 'modified';
};

/**
 * Pairs of equal line indexes on the longest common subsequence of `a` and `b`,
 * in ascending order.
 */
const lcsPairs = (a: string[], b: string[]): Array<[number, number]> => {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
};

/**
 * Computes change blocks from the full text of both sides. Used when GitLab
 * returns no diff for a file because it is too large. The common prefix and
 * suffix are trimmed first; if the remaining middle is still too large for a
 * line LCS, the middle becomes one modified block.
 */
export const computeLineBlocks = (
  oldLines: string[],
  newLines: string[],
  cellLimit = LINE_LCS_CELL_LIMIT,
): DiffBlock[] => {
  let prefix = 0;
  const maxPrefix = Math.min(oldLines.length, newLines.length);
  while (prefix < maxPrefix && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < maxPrefix - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  if (oldMiddle.length === 0 && newMiddle.length === 0) return [];

  const blocks: DiffBlock[] = [];
  const push = (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
    const oldCount = oldEnd - oldStart;
    const newCount = newEnd - newStart;
    if (oldCount === 0 && newCount === 0) return;
    blocks.push({
      id: blocks.length,
      kind: kindOf(oldCount, newCount),
      oldStart: prefix + oldStart,
      oldCount,
      newStart: prefix + newStart,
      newCount,
    });
  };

  if (oldMiddle.length * newMiddle.length > cellLimit) {
    push(0, oldMiddle.length, 0, newMiddle.length);
    return blocks;
  }

  let oldCursor = 0;
  let newCursor = 0;
  lcsPairs(oldMiddle, newMiddle).forEach(([i, j]) => {
    push(oldCursor, i, newCursor, j);
    oldCursor = i + 1;
    newCursor = j + 1;
  });
  push(oldCursor, oldMiddle.length, newCursor, newMiddle.length);
  return blocks;
};
