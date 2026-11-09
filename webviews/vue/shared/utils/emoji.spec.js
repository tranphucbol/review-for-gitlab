import { describe, expect, it, vi } from 'vitest';
import {
  COMMON_EMOJI,
  createEmojiLoader,
  emojiSections,
  reactionTitle,
  toggleGroups,
} from './emoji';

const entry = (name, category, description = name) => ({
  name,
  emoji: name[0],
  description,
  category,
});

const EMOJIS = [
  entry('thumbsup', 'people', 'thumbs up sign'),
  entry('smiley', 'people', 'smiling face'),
  entry('dog', 'nature'),
  entry('hotdog', 'food'),
];

describe('emoji', () => {
  describe('emojiSections', () => {
    it('shows the common emoji, then each category in order', () => {
      const sections = emojiSections(EMOJIS);

      expect(sections.map(s => s.title)).toEqual([
        'Common',
        'Smileys & people',
        'Animals & nature',
        'Food & drink',
      ]);
      expect(sections[0].emojis.map(e => e.name)).toEqual(COMMON_EMOJI.map(e => e.name));
      // the instance's own character wins over the built-in one
      expect(sections[0].emojis[0].emoji).toBe('t');
    });

    it('searches names first, then descriptions, ignoring colons', () => {
      const [section] = emojiSections(EMOJIS, ':dog');

      expect(section.emojis.map(e => e.name)).toEqual(['dog', 'hotdog']);
      expect(emojiSections(EMOJIS, 'smiling')[0].emojis.map(e => e.name)).toEqual(['smiley']);
    });
  });

  describe('createEmojiLoader', () => {
    it('asks once', async () => {
      const load = vi.fn().mockResolvedValue(EMOJIS);
      const loadEmojis = createEmojiLoader(load);

      expect(await loadEmojis()).toEqual({ emojis: EMOJIS });
      await loadEmojis();

      expect(load).toHaveBeenCalledTimes(1);
    });

    it('falls back to the common emoji and asks again next time', async () => {
      const load = vi.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValue(EMOJIS);
      const loadEmojis = createEmojiLoader(load);

      expect(await loadEmojis()).toEqual({
        emojis: COMMON_EMOJI,
        error: 'Only common emoji are available.',
      });
      expect(await loadEmojis()).toEqual({ emojis: EMOJIS });
    });
  });

  describe('reactionTitle', () => {
    it('names the current user first and counts the rest', () => {
      expect(reactionTitle({ name: 'eyes', count: 3, users: ['Alice', 'Bob'], mine: true })).toBe(
        'You, Alice and Bob reacted with :eyes:',
      );
      expect(reactionTitle({ name: 'eyes', count: 3, users: ['Alice'], mine: false })).toBe(
        'Alice and 2 more reacted with :eyes:',
      );
    });
  });

  describe('toggleGroups', () => {
    const groups = [{ name: 'eyes', emoji: '👀', count: 1, users: ['Alice'], mine: false }];

    it('adds the current user to a group, or a new group', () => {
      expect(toggleGroups(groups, 'eyes', true)).toEqual([
        { name: 'eyes', emoji: '👀', count: 2, users: ['Alice'], mine: true },
      ]);
      expect(toggleGroups(groups, 'rocket', true, '🚀')).toEqual([
        ...groups,
        { name: 'rocket', emoji: '🚀', count: 1, users: [], mine: true },
      ]);
    });

    it('takes the current user out, dropping an empty group', () => {
      const mine = toggleGroups(groups, 'eyes', true);

      expect(toggleGroups(mine, 'eyes', false)).toEqual(groups);
      expect(toggleGroups(toggleGroups(groups, 'rocket', true), 'rocket', false)).toEqual(groups);
    });

    it('changes nothing that is already so', () => {
      expect(toggleGroups(groups, 'eyes', false)).toBe(groups);
      expect(toggleGroups(groups, 'rocket', false)).toBe(groups);
    });
  });
});
