import { GitLabService } from '../gitlab/gitlab_service';
import { Account } from '../../common/platform/gitlab_account';
import { currentUserRequest } from '../../common/gitlab/api/get_current_user';
import { getRestIdFromGraphQLId } from '../../common/gitlab/api/get_rest_id_from_graphql_id';
import { log } from '../../common/log';

/** One emoji on a note, with everyone who left it. Sent to the webviews as is, so it stays plain data. */
export interface ReactionGroup {
  /** GitLab's emoji name, such as `thumbsup`. */
  name: string;
  /** The character, when the instance's emoji list knows the name. */
  emoji?: string;
  count: number;
  /** Display names of everyone else, for the tooltip. */
  users: string[];
  /** The current user is one of them. */
  mine: boolean;
}

/** A note's GraphQL ID to its reactions, grouped by name in the order each was first left. */
export type NoteReactions = Record<string, ReactionGroup[]>;

export interface EmojiEntry {
  name: string;
  emoji: string;
  description: string;
  category: string;
}

/** How many notes are read at once; a merge request can have hundreds. */
export const MAX_PARALLEL_READS = 6;

/** The order the GitLab web picker shows its categories in; the file itself is alphabetical. */
const CATEGORY_ORDER = [
  'people',
  'nature',
  'food',
  'activity',
  'travel',
  'objects',
  'symbols',
  'flags',
];

const emojiCache = new Map<string, Promise<Record<string, RestEmojiEntry>>>();
const usernameCache = new Map<string, Promise<string>>();

export const clearCaches = () => {
  emojiCache.clear();
  usernameCache.clear();
};

/**
 * The signed-in user, read once per account. `account.username` is not enough: an account
 * from `GITLAB_WORKFLOW_TOKEN` stores a placeholder there. A failed read is tried again next time.
 */
const getUsername = async (service: GitLabService, account: Account): Promise<string> => {
  const cached = usernameCache.get(account.id);
  if (cached) return cached;

  const username = service.fetchFromApi(currentUserRequest).then(user => user.username);
  usernameCache.set(account.id, username);
  return username.catch(e => {
    usernameCache.delete(account.id);
    log.warn('Could not read the current user, so your own reactions may not show as yours.', e);
    return account.username;
  });
};

/** The instance's emoji file, read once per instance; a failed read is tried again next time. */
const getEmojiMap = async (service: GitLabService): Promise<Record<string, RestEmojiEntry>> => {
  const { instanceUrl } = await service.getCredentials();
  const cachedMap = emojiCache.get(instanceUrl);
  if (cachedMap) return cachedMap;

  const map = service.getEmojiMap();
  emojiCache.set(instanceUrl, map);
  map.catch(() => emojiCache.delete(instanceUrl));
  return map;
};

const toEmojiList = (map: Record<string, RestEmojiEntry>): EmojiEntry[] =>
  Object.entries(map)
    // skin tones are variants of another entry, and the five modifiers alone aren't reactions
    .filter(([name, entry]) => entry.e && entry.c !== 'modifier' && !/_tone\d$/.test(name))
    .map(([name, entry]) => ({ name, emoji: entry.e, description: entry.d, category: entry.c }))
    .sort((a, b) => {
      const rank = (category: string) => {
        const index = CATEGORY_ORDER.indexOf(category);
        return index === -1 ? CATEGORY_ORDER.length : index;
      };
      return rank(a.category) - rank(b.category);
    });

/** The emoji a reaction can be chosen from, in the web picker's order. */
export const getEmojiList = async (service: GitLabService): Promise<EmojiEntry[]> =>
  toEmojiList(await getEmojiMap(service));

/** Every name's character, skin tones included, since the web lets people react with them. */
const getEmojiCharacters = async (service: GitLabService): Promise<Map<string, string>> => {
  try {
    const map = await getEmojiMap(service);
    return new Map(Object.entries(map).map(([name, entry]) => [name, entry.e]));
  } catch (e) {
    log.warn('Could not read the emoji list of the GitLab instance.', e as Error);
    return new Map();
  }
};

export const groupReactions = (
  awards: RestAwardEmoji[],
  username: string,
  characters: Map<string, string>,
): ReactionGroup[] => {
  const groups = new Map<string, ReactionGroup>();
  awards.forEach(award => {
    const group = groups.get(award.name) ?? {
      name: award.name,
      emoji: characters.get(award.name),
      count: 0,
      users: [],
      mine: false,
    };
    group.count += 1;
    if (award.user.username === username) group.mine = true;
    else group.users.push(award.user.name || award.user.username);
    groups.set(award.name, group);
  });
  return [...groups.values()];
};

const mapWithLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/**
 * The reactions on each note. A note whose reactions cannot be read is left
 * out, so the webview shows it without any.
 */
export const readReactions = async (
  service: GitLabService,
  issuable: RestIssuable,
  noteIds: string[],
  account: Account,
): Promise<NoteReactions> => {
  if (noteIds.length === 0) return {};
  const [characters, username] = await Promise.all([
    getEmojiCharacters(service),
    getUsername(service, account),
  ]);
  const reactions: NoteReactions = {};
  await mapWithLimit(noteIds, MAX_PARALLEL_READS, async noteId => {
    try {
      const awards = await service.getNoteAwardEmoji(issuable, getRestIdFromGraphQLId(noteId));
      reactions[noteId] = groupReactions(awards, username, characters);
    } catch (e) {
      log.warn(`Could not read the reactions on note ${noteId}.`, e as Error);
    }
  });
  return reactions;
};

interface DiscussionLike {
  notes: { nodes: { id: string; system: boolean }[] };
}

const isDiscussion = (item: object): item is DiscussionLike => 'notes' in item;

/** The IDs of the notes that can carry reactions: every user note, not system notes or label events. */
export const getReactableNoteIds = (discussions: object[]): string[] =>
  discussions
    .filter(isDiscussion)
    .flatMap(d => d.notes.nodes.filter(n => !n.system).map(n => n.id));

/** Adds or removes the user's reaction, then answers with the note's reactions as GitLab has them. */
export const setReaction = async (
  service: GitLabService,
  issuable: RestIssuable,
  noteId: string,
  name: string,
  on: boolean,
  account: Account,
): Promise<ReactionGroup[]> => {
  await service.setNoteAwardEmoji(noteId, name, on);
  const [awards, characters, username] = await Promise.all([
    service.getNoteAwardEmoji(issuable, getRestIdFromGraphQLId(noteId)),
    getEmojiCharacters(service),
    getUsername(service, account),
  ]);
  return groupReactions(awards, username, characters);
};
