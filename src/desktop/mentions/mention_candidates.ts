import { GitLabService } from '../gitlab/gitlab_service';
import { ensureAbsoluteAvatarUrl } from '../gitlab/ensure_absolute_avatar_url';
import { FetchError } from '../errors/fetch_error';
import { log } from '../../common/log';

/** A person offered after `@` in a comment. Sent to the webviews as is, so it stays plain data. */
export interface MentionCandidate {
  username: string;
  name: string;
  avatarUrl?: string;
  /** The person already takes part in the issue or merge request. */
  participant: boolean;
}

export interface MentionCandidates {
  mentions: MentionCandidate[];
  /** Set when the project members could not be read; the participants may still be listed. */
  error?: string;
}

export const MAX_MENTION_CANDIDATES = 20;

/** GitLab matches a partial `search` only from three characters on; a shorter one finds nobody. */
export const MIN_SERVER_SEARCH_LENGTH = 3;

/** How many members we read once and filter locally while the query is too short to search. */
const MEMBER_LIST_SIZE = 100;

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: Promise<T>;
  expiresAt: number;
}

const participantsCache = new Map<string, CacheEntry<RestParticipant[]>>();
const membersCache = new Map<string, CacheEntry<RestMrUser[]>>();

const cached = <T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> => {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;

  const value = load();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  // a failure is not remembered, the next keystroke asks again
  value.catch(() => cache.delete(key));
  return value;
};

export const clearMentionCache = () => {
  participantsCache.clear();
  membersCache.clear();
};

/** 0 for a username prefix, 1 for a name (or name word) prefix, 2 for any other match. */
const rank = (user: RestMrUser, query: string): number | undefined => {
  if (!query) return 0;
  const username = user.username.toLowerCase();
  const name = user.name.toLowerCase();
  if (username.startsWith(query)) return 0;
  if (name.startsWith(query) || name.split(/\s+/).some(word => word.startsWith(query))) return 1;
  if (username.includes(query) || name.includes(query)) return 2;
  return undefined;
};

const filterAndRank = <T extends RestMrUser>(users: T[], query: string): T[] =>
  users
    .map((user, index) => ({ user, index, rank: rank(user, query) }))
    .filter((entry): entry is { user: T; index: number; rank: number } => entry.rank !== undefined)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.user);

const loadParticipants = async (
  service: GitLabService,
  issuable: RestIssuable,
  key: string,
): Promise<RestParticipant[]> => {
  try {
    const participants = await cached(participantsCache, key, () =>
      service.getParticipants(issuable),
    );
    return participants.filter(p => p.state !== 'blocked');
  } catch (e) {
    if (e instanceof FetchError && e.status === 404) return [];
    log.warn(`Could not read the participants of ${issuable.references.full}.`, e as Error);
    return [];
  }
};

const loadMembers = async (
  service: GitLabService,
  projectId: number,
  instanceUrl: string,
  query: string,
): Promise<RestMrUser[]> => {
  if (query.length >= MIN_SERVER_SEARCH_LENGTH) {
    return service.getProjectUsers(projectId, query, MAX_MENTION_CANDIDATES);
  }
  const members = await cached(membersCache, `${instanceUrl}|${projectId}`, () =>
    service.getProjectUsers(projectId, undefined, MEMBER_LIST_SIZE),
  );
  return filterAndRank(members, query);
};

const toCandidate = (
  user: RestMrUser,
  participant: boolean,
  instanceUrl: string,
): MentionCandidate => ({
  username: user.username,
  name: user.name,
  avatarUrl: user.avatar_url ? ensureAbsoluteAvatarUrl(instanceUrl, user.avatar_url) : undefined,
  participant,
});

/**
 * People to offer after `@`: the participants of the issuable that match the
 * query first, then the members of its project, at most MAX_MENTION_CANDIDATES.
 */
export const getMentionCandidates = async (
  service: GitLabService,
  issuable: RestIssuable,
  query: string,
): Promise<MentionCandidates> => {
  const { instanceUrl } = await service.getCredentials();
  const normalizedQuery = query.trim().toLowerCase();

  const [participants, members] = await Promise.all([
    loadParticipants(service, issuable, `${instanceUrl}|${issuable.references.full}`),
    loadMembers(service, issuable.project_id, instanceUrl, normalizedQuery).then(
      users => ({ users, error: undefined }),
      (e: Error) => {
        log.warn(`Could not read the members of project ${issuable.project_id}.`, e);
        return { users: [] as RestMrUser[], error: 'Could not load project members.' };
      },
    ),
  ]);

  const seen = new Set<string>();
  const mentions: MentionCandidate[] = [];
  const add = (user: RestMrUser, participant: boolean) => {
    if (mentions.length >= MAX_MENTION_CANDIDATES || seen.has(user.username)) return;
    seen.add(user.username);
    mentions.push(toCandidate(user, participant, instanceUrl));
  };
  filterAndRank(participants, normalizedQuery).forEach(user => add(user, true));
  members.users.forEach(user => add(user, false));

  return members.error ? { mentions, error: members.error } : { mentions };
};
