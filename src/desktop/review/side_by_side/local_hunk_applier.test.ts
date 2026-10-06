import { UserFriendlyError } from '../../errors/user_friendly_error';
import { LocalHunkApplier, minimalEdit } from './local_hunk_applier';
import { BlockRange } from './messages';

const base = ['a', 'b', 'c', 'd', 'e', ''].join('\n');
const head = ['a', 'B', 'c', 'd', 'x', 'e', ''].join('\n');

// b → B, and x inserted after d
const modified: BlockRange = { blockId: 0, oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 };
const inserted: BlockRange = { blockId: 1, oldStart: 4, oldCount: 0, newStart: 4, newCount: 1 };

describe('LocalHunkApplier', () => {
  let applier: LocalHunkApplier;

  beforeEach(() => {
    applier = new LocalHunkApplier(base, head);
  });

  describe('state', () => {
    it('offers to apply when the local file is the base', () => {
      expect(applier.state(base)).toEqual({ applicable: 'base', appliedBlockIds: [] });
    });

    it('offers to revert when the local file is the head', () => {
      expect(applier.state(head)).toEqual({ applicable: 'head', appliedBlockIds: [] });
    });

    it('ignores Windows line endings', () => {
      expect(applier.state(head.replace(/\n/g, '\r\n')).applicable).toBe('head');
    });

    it('offers nothing when the local file is something else', () => {
      expect(applier.state('local work')).toEqual({
        applicable: 'none',
        reason: expect.stringContaining('neither the base nor the head'),
        appliedBlockIds: [],
      });
    });

    it('offers nothing when there is no local file', () => {
      expect(applier.state(undefined)).toMatchObject({
        applicable: 'none',
        reason: expect.stringContaining('does not exist'),
      });
    });
  });

  describe('apply', () => {
    it('copies head lines into a base file, one block at a time', () => {
      const once = applier.apply(base, inserted, 'apply');
      expect(once).toBe(['a', 'b', 'c', 'd', 'x', 'e', ''].join('\n'));
      expect(applier.state(once)).toEqual({ applicable: 'base', appliedBlockIds: [1] });

      const twice = applier.apply(once, modified, 'apply');
      expect(twice).toBe(head);
      expect(applier.state(twice)).toEqual({ applicable: 'base', appliedBlockIds: [1, 0] });
    });

    it('puts base lines back into a head file', () => {
      const once = applier.apply(head, inserted, 'revert');
      expect(once).toBe(['a', 'B', 'c', 'd', 'e', ''].join('\n'));
      expect(applier.apply(once, modified, 'revert')).toBe(base);
    });

    it('refuses an arrow that does not match the local file', () => {
      expect(() => applier.apply(head, modified, 'apply')).toThrow(UserFriendlyError);
      expect(() => applier.apply('local work', modified, 'revert')).toThrow(UserFriendlyError);
    });

    it('stops when something else changed the file after a block was applied', () => {
      const once = applier.apply(base, modified, 'apply');
      const edited = `${once}more`;

      expect(applier.state(edited)).toMatchObject({
        applicable: 'none',
        reason: expect.stringContaining('changed outside this view'),
      });
      expect(() => applier.apply(edited, inserted, 'apply')).toThrow(UserFriendlyError);
    });

    it('starts over when the file is the base again, for example after undo', () => {
      applier.apply(base, modified, 'apply');

      expect(applier.state(base)).toEqual({ applicable: 'base', appliedBlockIds: [] });
    });

    it('refuses a block twice or out of range', () => {
      const once = applier.apply(base, modified, 'apply');

      expect(() => applier.apply(once, modified, 'apply')).toThrow('Invalid diff block');
      expect(() => applier.apply(once, { ...inserted, blockId: 5, oldStart: 40 }, 'apply')).toThrow(
        'Invalid diff block',
      );
    });

    it('forgets a block whose edit failed', () => {
      applier.apply(base, modified, 'apply');
      applier.forget(modified.blockId);

      expect(applier.state(base)).toEqual({ applicable: 'base', appliedBlockIds: [] });
    });
  });
});

describe('minimalEdit', () => {
  it('replaces only what differs', () => {
    expect(minimalEdit('a\nb\nc\n', 'a\nB\nc\n')).toEqual({ start: 2, end: 3, text: 'B' });
  });

  it('inserts at a point', () => {
    expect(minimalEdit('a\nc\n', 'a\nb\nc\n')).toEqual({ start: 2, end: 2, text: 'b\n' });
  });

  it('deletes a range', () => {
    expect(minimalEdit('a\nb\nc\n', 'a\nc\n')).toEqual({ start: 2, end: 4, text: '' });
  });
});
