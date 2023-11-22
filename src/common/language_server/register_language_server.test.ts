import { TRACKING_EVENTS } from '@gitlab-org/gitlab-lsp';
import { BaseLanguageClient, DidChangeConfigurationNotification } from 'vscode-languageclient';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { LanguageClientWrapper } from './register_language_server';
import { GitLabPlatformManagerForCodeSuggestions } from '../code_suggestions/gitlab_platform_manager_for_code_suggestions';
import { GitLabPlatformForAccount, GitLabPlatformManager } from '../platform/gitlab_platform';
import { gitlabPlatformForAccount } from '../test_utils/entities';

jest.mock('../code_suggestions/gitlab_platform_manager_for_code_suggestions');

describe('LanguageClientWrapper', () => {
  describe('initAndStart', () => {
    let client: BaseLanguageClient;

    // this value is ignored and used only as an argument when constructing GitLabManagerForCodeSuggestions
    const fakeManager = createFakePartial<GitLabPlatformManager>({});

    let gitLabPlatform: GitLabPlatformForAccount;

    beforeEach(() => {
      gitLabPlatform = gitlabPlatformForAccount;
      jest.mocked(GitLabPlatformManagerForCodeSuggestions).mockReturnValue(
        createFakePartial<GitLabPlatformManagerForCodeSuggestions>({
          getGitLabPlatform: async () => gitLabPlatform,
        }),
      );
      client = createFakePartial<BaseLanguageClient>({
        start: jest.fn(),
        stop: jest.fn(),
        registerProposedFeatures: jest.fn(),
        onNotification: jest.fn(),
        sendNotification: jest.fn(),
      });
    });
    it('starts the client and synchronizes the configuration', async () => {
      const wrapper = new LanguageClientWrapper(client, fakeManager);

      await wrapper.initAndStart();

      expect(client.registerProposedFeatures).toHaveBeenCalled();
      expect(client.start).toHaveBeenCalled();
      expect(client.sendNotification).toHaveBeenCalledWith(
        DidChangeConfigurationNotification.type,
        {
          settings: {
            baseUrl: gitlabPlatformForAccount.account.instanceUrl,
            token: gitlabPlatformForAccount.account.token,
            telemetry: {
              actions: [{ action: TRACKING_EVENTS.ACCEPTED }],
            },
          },
        },
      );
    });

    it('stops client when disposed', async () => {
      const wrapper = new LanguageClientWrapper(client, fakeManager);

      await wrapper.initAndStart();
      wrapper.dispose();

      expect(client.stop).toHaveBeenCalled();
    });
  });
});
