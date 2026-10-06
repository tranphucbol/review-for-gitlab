export type BlockKind = 'modified' | 'inserted' | 'deleted';

/**
 * A contiguous change: lines removed from the base followed by lines added in the head.
 * Starts are 0-based line indexes; a count of 0 means the block sits between
 * line `start` and line `start + 1` (1-based) on that side.
 */
export interface DiffBlock {
  id: number;
  kind: BlockKind;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export type DiffSide = 'old' | 'new';
