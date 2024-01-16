import { GitLabPlatformForAccount, GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabPlatformManagerForChat } from './get_platform_manager_for_chat';
import { account, gitlabPlatformForAccount } from '../test_utils/entities';
import { Account } from '../platform/gitlab_account';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { getChatSupport, ChatSupportResponseInterface } from './api/get_chat_support';

jest.mock('../utils/extension_configuration');
jest.mock('./api/get_chat_support', () => ({
  getChatSupport: jest.fn(),
}));

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

    it('returns undefined if the platform for the account does not have chat enabled', async () => {
      jest.mocked(getChatSupport).mockResolvedValue({ hasSupportForChat: false });
      expect(await platformManagerForChat.getGitLabPlatform()).toBeUndefined();
    });

    it('returns gitlab platform for that account if chat is available for the platform', async () => {
      jest
        .mocked(getChatSupport)
        .mockResolvedValue({ hasSupportForChat: true, platform: customGitlabPlatformForAccount });
      expect(await platformManagerForChat.getGitLabPlatform()).toBe(customGitlabPlatformForAccount);
    });
  });

  describe('when multiple gitlab accounts are available', () => {
    const firstPlatformWithChatEnabled: ChatSupportResponseInterface = {
      hasSupportForChat: true,
      platform: firstGitlabPlatformForAccount,
    };
    const secondPlatformWithChatEnabled: ChatSupportResponseInterface = {
      hasSupportForChat: true,
      platform: secondGitLabPlatformForAccount,
    };
    const platformWithoutChatEnabled: ChatSupportResponseInterface = { hasSupportForChat: false };

    beforeEach(() => {
      jest
        .mocked(gitlabPlatformManager.getForAllAccounts)
        .mockResolvedValueOnce([firstGitlabPlatformForAccount, secondGitLabPlatformForAccount]);
    });

    it.each`
      desc                | firstResolve                    | secondResolve                    | expectedPlatform
      ${'the first has'}  | ${firstPlatformWithChatEnabled} | ${platformWithoutChatEnabled}    | ${firstGitlabPlatformForAccount}
      ${'the second has'} | ${platformWithoutChatEnabled}   | ${secondPlatformWithChatEnabled} | ${secondGitLabPlatformForAccount}
      ${'several have'}   | ${firstPlatformWithChatEnabled} | ${secondPlatformWithChatEnabled} | ${firstGitlabPlatformForAccount}
    `(
      'returns the correct gitlab platform when $desc the chat enabled',
      async ({ firstResolve, secondResolve, expectedPlatform }) => {
        jest
          .mocked(getChatSupport)
          .mockResolvedValue(platformWithoutChatEnabled)
          .mockResolvedValueOnce(firstResolve)
          .mockResolvedValueOnce(secondResolve);
        expect(await platformManagerForChat.getGitLabPlatform()).toBe(expectedPlatform);
      },
    );

    it('correctly returns undefined if none of the platforms have chat enabled', async () => {
      jest.mocked(getChatSupport).mockResolvedValue(platformWithoutChatEnabled);
      expect(await platformManagerForChat.getGitLabPlatform()).toBe(undefined);
    });
  });
});
