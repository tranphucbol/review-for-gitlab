import { GitLabService } from '../gitlab/gitlab_service';
import { FetchError } from '../errors/fetch_error';
import { createFakePartial } from '../../common/test_utils/create_fake_partial';
import { testCredentials } from '../test_utils/test_credentials';
import { mr } from '../test_utils/entities';
import {
  clearMentionCache,
  getMentionCandidates,
  MAX_MENTION_CANDIDATES,
} from './mention_candidates';

jest.mock('../../common/log');

const user = (username: string, name: string, avatarUrl: string | null = null): RestMrUser => ({
  id: username.length,
  username,
  name,
  avatar_url: avatarUrl,
});

const participant = (username: string, name: string, state = 'active'): RestParticipant => ({
  ...user(username, name),
  state,
});

const notFound = () =>
  new FetchError(createFakePartial<Response>({ ok: false, status: 404, url: 'x' }), 'participants');

describe('getMentionCandidates', () => {
  let getParticipants: jest.Mock;
  let getProjectUsers: jest.Mock;
  let service: GitLabService;

  beforeEach(() => {
    clearMentionCache();
    getParticipants = jest
      .fn()
      .mockResolvedValue([participant('tomas', 'Tomas Vik'), participant('anna', 'Anna Smith')]);
    getProjectUsers = jest
      .fn()
      .mockResolvedValue([user('anna', 'Anna Smith'), user('andrew', 'Andrew Lee')]);
    service = createFakePartial<GitLabService>({
      getCredentials: async () => testCredentials(),
      getParticipants,
      getProjectUsers,
    });
  });

  const usernames = async (query: string) =>
    (await getMentionCandidates(service, mr, query)).mentions.map(m => m.username);

  it('lists participants before members, without duplicates', async () => {
    const { mentions } = await getMentionCandidates(service, mr, '');

    expect(mentions).toEqual([
      { username: 'tomas', name: 'Tomas Vik', avatarUrl: undefined, participant: true },
      { username: 'anna', name: 'Anna Smith', avatarUrl: undefined, participant: true },
      { username: 'andrew', name: 'Andrew Lee', avatarUrl: undefined, participant: false },
    ]);
  });

  it('filters participants by username and name, prefixes first', async () => {
    getParticipants.mockResolvedValue([
      participant('xsmith', 'Bob X'),
      participant('bob', 'Bob Smith'),
      participant('smith', 'Some One'),
    ]);
    getProjectUsers.mockResolvedValue([]);

    expect(await usernames('Smi')).toEqual(['smith', 'bob', 'xsmith']);
  });

  it('leaves out blocked participants', async () => {
    getParticipants.mockResolvedValue([participant('gone', 'Gone User', 'blocked')]);
    getProjectUsers.mockResolvedValue([]);

    expect(await usernames('')).toEqual([]);
  });

  it('filters a cached member list locally while the query is shorter than three characters', async () => {
    expect(await usernames('an')).toEqual(['anna', 'andrew']);
    expect(await usernames('and')).toEqual(['anna', 'andrew']);
    await usernames('a');

    expect(getProjectUsers).toHaveBeenNthCalledWith(1, mr.project_id, undefined, 100);
    expect(getProjectUsers).toHaveBeenNthCalledWith(2, mr.project_id, 'and', 20);
    expect(getProjectUsers).toHaveBeenCalledTimes(2);
    expect(getParticipants).toHaveBeenCalledTimes(1);
  });

  it('makes relative avatar URLs absolute', async () => {
    getParticipants.mockResolvedValue([]);
    getProjectUsers.mockResolvedValue([user('ann', 'Ann', '/uploads/-/system/user/avatar/1.png')]);

    const { mentions } = await getMentionCandidates(service, mr, '');

    expect(mentions[0].avatarUrl).toBe(
      'https://gitlab.example.com/uploads/-/system/user/avatar/1.png',
    );
  });

  it('caps the list', async () => {
    getParticipants.mockResolvedValue([]);
    getProjectUsers.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => user(`user${i}`, `User ${i}`)),
    );

    expect(await usernames('')).toHaveLength(MAX_MENTION_CANDIDATES);
  });

  it('falls back to members when the participants endpoint is missing', async () => {
    getParticipants.mockRejectedValue(notFound());

    expect(await usernames('')).toEqual(['anna', 'andrew']);
  });

  it('asks for participants again after a failure', async () => {
    getParticipants.mockRejectedValueOnce(new Error('network'));

    expect(await usernames('')).toEqual(['anna', 'andrew']);
    expect(await usernames('')).toEqual(['tomas', 'anna', 'andrew']);
  });

  it('keeps the participants and reports an error when the members fail', async () => {
    getProjectUsers.mockRejectedValue(new Error('network'));

    expect(await getMentionCandidates(service, mr, '')).toEqual({
      mentions: [
        expect.objectContaining({ username: 'tomas' }),
        expect.objectContaining({ username: 'anna' }),
      ],
      error: 'Could not load project members.',
    });
  });
});
