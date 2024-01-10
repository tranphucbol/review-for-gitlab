import { GitLabPlatformForAccount, GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabPlatformManagerForChat } from './get_platform_manager_for_chat';
import { account, gitlabPlatformForAccount } from '../test_utils/entities';
import { Account } from '../platform/gitlab_account';
import { createFakePartial } from '../test_utils/create_fake_partial';

jest.mock('../utils/extension_configuration');

describe('GitLabPlatformManagerForChat', () => {
  let platformManagerForChat: GitLabPlatformManagerForChat;
  let gitlabPlatformManager: GitLabPlatformManager;

  const buildGitLabPlatformForAccount = (useAccount: Account): GitLabPlatformForAccount => ({
    ...gitlabPlatformForAccount,
    account: useAccount,
  });

  const firstGitlabPlatformForAccount: GitLabPlatformForAccount = buildGitLabPlatformForAccount({
    ...account,
    username: 'first-account',
  });
  const secondGitLabPlatformForAccount: GitLabPlatformForAccount = buildGitLabPlatformForAccount({
    ...account,
    username: 'second-account',
  });

  beforeEach(() => {
    gitlabPlatformManager = createFakePartial<GitLabPlatformManager>({
      getForActiveProject: jest.fn(),
      getForActiveAccount: jest.fn(),
      getForAllAccounts: jest.fn(),
      getForSaaSAccount: jest.fn(),
    });

    platformManagerForChat = new GitLabPlatformManagerForChat(gitlabPlatformManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when no gitlab account is available', () => {
    beforeEach(() => {
      jest.mocked(gitlabPlatformManager.getForAllAccounts).mockResolvedValueOnce([]);
    });

    it('returns undefined', async () => {
      expect(await platformManagerForChat.getGitLabPlatform()).toBe(undefined);
    });
  });

  describe('when a single gitlab account is available', () => {
    let customGitlabPlatformForAccount: GitLabPlatformForAccount;

    beforeEach(() => {
      customGitlabPlatformForAccount = firstGitlabPlatformForAccount;

      jest
        .mocked(gitlabPlatformManager.getForAllAccounts)
        .mockResolvedValueOnce([customGitlabPlatformForAccount]);
    });

    it('returns gitlab platform for that account', async () => {
      expect(await platformManagerForChat.getGitLabPlatform()).toBe(customGitlabPlatformForAccount);
    });
  });

  describe('when multiple gitlab accounts are available', () => {
    beforeEach(() => {
      jest
        .mocked(gitlabPlatformManager.getForAllAccounts)
        .mockResolvedValueOnce([firstGitlabPlatformForAccount, secondGitLabPlatformForAccount]);
    });

    it('returns gitlab platform for the first linked account', async () => {
      expect(await platformManagerForChat.getGitLabPlatform()).toBe(firstGitlabPlatformForAccount);
    });
  });
});
