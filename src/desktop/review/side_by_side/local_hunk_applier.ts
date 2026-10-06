import { UserFriendlyError } from '../../errors/user_friendly_error';
import { BlockRange, LocalApplicability } from './messages';

export type HunkDirection = 'apply' | 'revert';

export interface LocalState {
  applicable: LocalApplicability;
  reason?: string;
  appliedBlockIds: number[];
}

type Side = 'base' | 'head';

const MATCHES_NEITHER =
  'The local file matches neither the base nor the head of this merge request, so the view does not change it.';

const CHANGED_OUTSIDE =
  'The local file changed outside this view, so the view no longer changes it. Make the file match the base or the head of the merge request again to use the arrows.';

const MISSING = 'The file does not exist in your local repository.';

const normalizeEol = (text: string) => text.replace(/\r\n/g, '\n');

const sideOf = (direction: HunkDirection): Side => (direction === 'apply' ? 'base' : 'head');

/** The lines a block covers on the side the local file started from, and on the other side. */
const spans = (block: BlockRange, from: Side) =>
  from === 'base'
    ? {
        start: block.oldStart,
        count: block.oldCount,
        otherStart: block.newStart,
        otherCount: block.newCount,
      }
    : {
        start: block.newStart,
        count: block.newCount,
        otherStart: block.oldStart,
        otherCount: block.oldCount,
      };

/**
 * The single replacement that turns `current` into `next`: everything between their common
 * prefix and their common suffix. `start` and `end` are offsets into `current`.
 */
export const minimalEdit = (current: string, next: string) => {
  const shorter = Math.min(current.length, next.length);
  let start = 0;
  while (start < shorter && current[start] === next[start]) start += 1;
  let suffix = 0;
  while (
    suffix < shorter - start &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return { start, end: current.length - suffix, text: next.slice(start, next.length - suffix) };
};

/**
 * Tracks which diff blocks the side-by-side view copied into the local file.
 *
 * The local file starts out equal to the base (blocks are applied, base → head) or to the
 * head (blocks are reverted, head → base). Every applied block replaces its lines with the
 * other side's lines, so the expected local text is always known. Before each change the
 * whole local file is compared with it; if anything else changed the file, the view stops
 * changing it rather than guess where the block went.
 */
export class LocalHunkApplier {
  readonly #lines: Record<Side, string[]>;

  #from?: Side;

  #applied: BlockRange[] = [];

  constructor(oldText: string, newText: string) {
    this.#lines = {
      base: normalizeEol(oldText).split('\n'),
      head: normalizeEol(newText).split('\n'),
    };
  }

  #expectedText(from: Side, applied: BlockRange[]): string {
    const other: Side = from === 'base' ? 'head' : 'base';
    const source = this.#lines[from];
    const result: string[] = [];
    let next = 0;
    [...applied]
      .map(block => spans(block, from))
      .sort((a, b) => a.start - b.start)
      .forEach(({ start, count, otherStart, otherCount }) => {
        result.push(...source.slice(next, start));
        result.push(...this.#lines[other].slice(otherStart, otherStart + otherCount));
        next = start + count;
      });
    result.push(...source.slice(next));
    return result.join('\n');
  }

  /** Works out which arrows the view shows for the current local text, `undefined` if there is no file. */
  state(localText: string | undefined): LocalState {
    if (localText === undefined) {
      this.#from = undefined;
      this.#applied = [];
      return { applicable: 'none', reason: MISSING, appliedBlockIds: [] };
    }
    const local = normalizeEol(localText);
    if (
      this.#from &&
      this.#applied.length &&
      local === this.#expectedText(this.#from, this.#applied)
    ) {
      return { applicable: this.#from, appliedBlockIds: this.#applied.map(b => b.blockId) };
    }
    const hadApplied = this.#applied.length > 0;
    this.#applied = [];
    this.#from = (['base', 'head'] as const).find(side => local === this.#lines[side].join('\n'));
    if (this.#from) return { applicable: this.#from, appliedBlockIds: [] };
    return {
      applicable: 'none',
      reason: hadApplied ? CHANGED_OUTSIDE : MATCHES_NEITHER,
      appliedBlockIds: [],
    };
  }

  /**
   * Records `block` as applied and returns the local text with it applied, using `\n` line
   * endings. Throws, and records nothing, if the local text is not what the view expects.
   */
  apply(localText: string, block: BlockRange, direction: HunkDirection): string {
    const { applicable } = this.state(localText);
    const from = sideOf(direction);
    if (applicable !== from) {
      throw new UserFriendlyError(
        'The local file changed; reopen the view to apply changes to it.',
        new Error(`The local file matches ${applicable}, the arrow expects ${from}.`),
      );
    }
    this.#assertValid(block, from);
    const applied = [...this.#applied, block];
    const text = this.#expectedText(from, applied);
    this.#applied = applied;
    return text;
  }

  /** Forgets a block whose edit VS Code did not apply. */
  forget(blockId: number): void {
    this.#applied = this.#applied.filter(b => b.blockId !== blockId);
  }

  #assertValid(block: BlockRange, from: Side): void {
    const values = [block.oldStart, block.oldCount, block.newStart, block.newCount];
    const valid =
      values.every(v => Number.isInteger(v) && v >= 0) &&
      block.oldStart + block.oldCount <= this.#lines.base.length &&
      block.newStart + block.newCount <= this.#lines.head.length;
    const { start, count } = spans(block, from);
    const overlaps = this.#applied.some(applied => {
      const other = spans(applied, from);
      if (applied.blockId === block.blockId) return true;
      if (count === 0 || other.count === 0) return start === other.start;
      return start < other.start + other.count && other.start < start + count;
    });
    if (!valid || overlaps) throw new Error(`Invalid diff block ${JSON.stringify(block)}.`);
  }
}
