import { GitLabPlatformManager } from '../../platform/gitlab_platform';
import { GitLabPlatformManagerForChat } from '../get_platform_manager_for_chat';
import { gitlabPlatformForAccount } from '../../test_utils/entities';
import { createFakePartial } from '../../test_utils/create_fake_partial';
import { log } from '../../log';
import { getChatSupport, ChatAvailableResponseType } from './get_chat_support';

jest.mock('../get_platform_manager_for_chat');

describe('getChatSupport', () => {
  let manager: GitLabPlatformManager;
  let platformManagerForChat: GitLabPlatformManagerForChat;
  const mockApiResponse = (duoChatAvailable: boolean = true) => {
    const apiResponse: ChatAvailableResponseType = {
      currentUser: {
        duoChatAvailable,
      },
    };
    jest.mocked(platformManagerForChat.getGitLabPlatform).mockResolvedValue({
      ...gitlabPlatformForAccount,
      fetchFromApi: jest.fn().mockResolvedValue(apiResponse),
    });
  };

  beforeEach(() => {
    manager = createFakePartial<GitLabPlatformManager>({
      getForAllAccounts: jest.fn(),
    });
    platformManagerForChat = createFakePartial<GitLabPlatformManagerForChat>({
      getGitLabPlatform: jest.fn(),
    });
    jest.mocked(GitLabPlatformManagerForChat).mockImplementation(() => platformManagerForChat);
    jest.spyOn(log, 'error');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns false if there is no platform', async () => {
    jest.mocked(platformManagerForChat.getGitLabPlatform).mockResolvedValue(undefined);
    const result = await getChatSupport(manager);
    expect(result).toBe(false);
  });

  it('returns false and logs if fetching `duoChatAvailable` fails', async () => {
    jest.mocked(platformManagerForChat.getGitLabPlatform).mockResolvedValue({
      ...gitlabPlatformForAccount,
      fetchFromApi: jest.fn().mockRejectedValueOnce('foo'),
    });
    const result = await getChatSupport(manager);
    expect(result).toBe(false);
    expect(log.error).toHaveBeenCalledWith('foo');
  });

  it('returns false and does not log if the user does not have chat support', async () => {
    mockApiResponse(false);
    const result = await getChatSupport(manager);
    expect(result).toBe(false);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('returns true if the user has chat support', async () => {
    mockApiResponse();
    const result = await getChatSupport(manager);
    expect(result).toBe(true);
    expect(log.error).not.toHaveBeenCalled();
  });
});
