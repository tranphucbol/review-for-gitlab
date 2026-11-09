import { GitLabService } from '../gitlab/gitlab_service';
import { createFakePartial } from '../../common/test_utils/create_fake_partial';
import { testCredentials } from '../test_utils/test_credentials';
import { createTokenAccount, mr } from '../test_utils/entities';
import {
  clearCaches,
  getEmojiList,
  MAX_PARALLEL_READS,
  readReactions,
  setReaction,
} from './note_reactions';

jest.mock('../../common/log');

const award = (name: string, username: string, displayName = username): RestAwardEmoji => ({
  id: name.length + username.length,
  name,
  user: { id: username.length, username, name: displayName, avatar_url: null },
});

const emojiMap: Record<string, RestEmojiEntry> = {
  thumbsup: { c: 'people', e: '👍', d: 'thumbs up sign' },
  thumbsup_tone1: { c: 'people', e: '👍🏻', d: 'thumbs up sign tone 1' },
  tone1: { c: 'modifier', e: '🏻', d: 'emoji modifier' },
  rocket: { c: 'travel', e: '🚀', d: 'rocket' },
  eyes: { c: 'people', e: '👀', d: 'eyes' },
  apple: { c: 'food', e: '🍎', d: 'red apple' },
};

const noteId = (id: number) => `gid://gitlab/DiffNote/${id}`;

describe('note reactions', () => {
  let getNoteAwardEmoji: jest.Mock;
  let setNoteAwardEmoji: jest.Mock;
  let getEmojiMap: jest.Mock;
  let fetchFromApi: jest.Mock;
  let service: GitLabService;
  const account = createTokenAccount();

  beforeEach(() => {
    clearCaches();
    getNoteAwardEmoji = jest.fn().mockResolvedValue([]);
    setNoteAwardEmoji = jest.fn().mockResolvedValue(undefined);
    getEmojiMap = jest.fn().mockResolvedValue(emojiMap);
    fetchFromApi = jest.fn().mockResolvedValue({ username: 'me' });
    service = createFakePartial<GitLabService>({
      getCredentials: async () => testCredentials(),
      fetchFromApi,
      getNoteAwardEmoji,
      setNoteAwardEmoji,
      getEmojiMap,
    });
  });

  describe('readReactions', () => {
    it('groups the awards on each note by name, in the order each was first left', async () => {
      getNoteAwardEmoji.mockResolvedValue([
        award('eyes', 'alice', 'Alice'),
        award('thumbsup', 'bob', 'Bob'),
        award('eyes', 'me', 'Me'),
        award('party_unknown', 'carol'),
        award('thumbsup_tone1', 'dave', 'Dave'),
      ]);

      const reactions = await readReactions(service, mr, [noteId(1)], account);

      expect(getNoteAwardEmoji).toHaveBeenCalledWith(mr, 1);
      expect(reactions).toEqual({
        [noteId(1)]: [
          { name: 'eyes', emoji: '👀', count: 2, users: ['Alice'], mine: true },
          { name: 'thumbsup', emoji: '👍', count: 1, users: ['Bob'], mine: false },
          { name: 'party_unknown', emoji: undefined, count: 1, users: ['carol'], mine: false },
          { name: 'thumbsup_tone1', emoji: '👍🏻', count: 1, users: ['Dave'], mine: false },
        ],
      });
    });

    it('leaves out a note whose reactions cannot be read', async () => {
      getNoteAwardEmoji.mockImplementation(async (_mr, id: number) => {
        if (id === 2) throw new Error('404');
        return [award('rocket', 'alice')];
      });

      const reactions = await readReactions(service, mr, [noteId(1), noteId(2)], account);

      expect(Object.keys(reactions)).toEqual([noteId(1)]);
    });

    it('still reads reactions when the emoji list cannot be read', async () => {
      getEmojiMap.mockRejectedValue(new Error('302'));
      getNoteAwardEmoji.mockResolvedValue([award('rocket', 'alice')]);

      const reactions = await readReactions(service, mr, [noteId(1)], account);

      expect(reactions[noteId(1)]).toEqual([
        { name: 'rocket', emoji: undefined, count: 1, users: ['alice'], mine: false },
      ]);
    });

    it(`reads at most ${MAX_PARALLEL_READS} notes at a time`, async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      getNoteAwardEmoji.mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => {
          setImmediate(resolve);
        });
        inFlight -= 1;
        return [];
      });
      const ids = Array.from({ length: 20 }, (_, i) => noteId(i + 1));

      const reactions = await readReactions(service, mr, ids, account);

      expect(getNoteAwardEmoji).toHaveBeenCalledTimes(20);
      expect(maxInFlight).toBe(MAX_PARALLEL_READS);
      expect(Object.keys(reactions)).toHaveLength(20);
    });

    it('reads nothing when there are no notes', async () => {
      expect(await readReactions(service, mr, [], account)).toEqual({});
      expect(getEmojiMap).not.toHaveBeenCalled();
      expect(fetchFromApi).not.toHaveBeenCalled();
    });

    it('asks GitLab who the user is, since an environment account stores a placeholder', async () => {
      getNoteAwardEmoji.mockResolvedValue([award('eyes', 'me')]);
      const envAccount = { ...account, username: 'environment_variable_credentials' };

      const reactions = await readReactions(service, mr, [noteId(1)], envAccount);
      await readReactions(service, mr, [noteId(1)], envAccount);

      expect(reactions[noteId(1)][0].mine).toBe(true);
      expect(fetchFromApi).toHaveBeenCalledTimes(1);
    });

    it("falls back to the account's username when the user cannot be read", async () => {
      fetchFromApi.mockRejectedValueOnce(new Error('500'));
      getNoteAwardEmoji.mockResolvedValue([award('eyes', 'user1')]);

      const reactions = await readReactions(service, mr, [noteId(1)], account);
      await readReactions(service, mr, [noteId(1)], account);

      expect(reactions[noteId(1)][0].mine).toBe(true);
      expect(fetchFromApi).toHaveBeenCalledTimes(2);
    });
  });

  describe('setReaction', () => {
    it('writes, then answers with the note as GitLab has it', async () => {
      getNoteAwardEmoji.mockResolvedValue([award('rocket', 'me'), award('rocket', 'alice')]);

      const groups = await setReaction(service, mr, noteId(7), 'rocket', true, account);

      expect(setNoteAwardEmoji).toHaveBeenCalledWith(noteId(7), 'rocket', true);
      expect(getNoteAwardEmoji).toHaveBeenCalledWith(mr, 7);
      expect(groups).toEqual([
        { name: 'rocket', emoji: '🚀', count: 2, users: ['alice'], mine: true },
      ]);
    });

    it('does not re-read the note when the write fails', async () => {
      setNoteAwardEmoji.mockRejectedValue(new Error('refused'));

      await expect(setReaction(service, mr, noteId(7), 'rocket', false, account)).rejects.toThrow(
        'refused',
      );
      expect(getNoteAwardEmoji).not.toHaveBeenCalled();
    });
  });

  describe('getEmojiList', () => {
    it('drops skin tones and modifiers and orders by category', async () => {
      const list = await getEmojiList(service);

      expect(list.map(e => e.name)).toEqual(['thumbsup', 'eyes', 'apple', 'rocket']);
      expect(list[0]).toEqual({
        name: 'thumbsup',
        emoji: '👍',
        description: 'thumbs up sign',
        category: 'people',
      });
    });

    it('reads the list once per instance', async () => {
      await getEmojiList(service);
      await getEmojiList(service);

      expect(getEmojiMap).toHaveBeenCalledTimes(1);
    });

    it('does not keep a failed read', async () => {
      getEmojiMap.mockRejectedValueOnce(new Error('404'));

      await expect(getEmojiList(service)).rejects.toThrow('404');
      expect(await getEmojiList(service)).toHaveLength(4);
      expect(getEmojiMap).toHaveBeenCalledTimes(2);
    });
  });
});
