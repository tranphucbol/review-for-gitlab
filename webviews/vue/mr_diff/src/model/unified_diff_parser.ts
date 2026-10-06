import type { BlockKind, DiffBlock } from './types';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const startIndex = (line: number, count: number) => (count === 0 ? line : line - 1);

const kindOf = (oldCount: number, newCount: number): BlockKind => {
  if (oldCount === 0) return 'inserted';
  if (newCount === 0) return 'deleted';
  return 'modified';
};

/**
 * Turns the `diff` field of a GitLab merge request diff into change blocks.
 * A run of removed lines followed by a run of added lines is one block.
 */
export const parseUnifiedDiff = (diff: string): DiffBlock[] => {
  const blocks: DiffBlock[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let current: Omit<DiffBlock, 'id' | 'kind'> | undefined;

  const closeBlock = () => {
    if (!current) return;
    blocks.push({
      id: blocks.length,
      kind: kindOf(current.oldCount, current.newCount),
      ...current,
    });
    current = undefined;
  };

  diff.split('\n').forEach(line => {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      closeBlock();
      oldIndex = startIndex(Number(header[1]), Number(header[2] ?? 1));
      newIndex = startIndex(Number(header[3]), Number(header[4] ?? 1));
      return;
    }
    const prefix = line[0];
    if (prefix === '-') {
      if (current && current.newCount > 0) closeBlock();
      if (!current) current = { oldStart: oldIndex, oldCount: 0, newStart: newIndex, newCount: 0 };
      current.oldCount += 1;
      oldIndex += 1;
    } else if (prefix === '+') {
      if (!current) current = { oldStart: oldIndex, oldCount: 0, newStart: newIndex, newCount: 0 };
      current.newCount += 1;
      newIndex += 1;
    } else if (prefix === ' ') {
      closeBlock();
      oldIndex += 1;
      newIndex += 1;
    }
    // '\ No newline at end of file' and empty trailing lines carry no position
  });
  closeBlock();
  return blocks;
};
