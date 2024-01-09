import {
  API_ERROR_NOTIFICATION,
  API_RECOVERY_NOTIFICATION,
  TRACKING_EVENTS,
} from '@gitlab-org/gitlab-lsp';
import {
  BaseLanguageClient,
  DidChangeConfigurationNotification,
  GenericNotificationHandler,
} from 'vscode-languageclient';
import { LanguageClientWrapper } from './language_client_wrapper';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { GitLabPlatformManagerForCodeSuggestions } from '../code_suggestions/gitlab_platform_manager_for_code_suggestions';
import { GitLabPlatformForAccount, GitLabPlatformManager } from '../platform/gitlab_platform';
import { gitlabPlatformForAccount, gitlabPlatformForProject } from '../test_utils/entities';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { setFakeWorkspaceConfiguration } from '../test_utils/vscode_fakes';

jest.mock('../code_suggestions/gitlab_platform_manager_for_code_suggestions');
jest.mock('../log'); // disable logging in tests

describe('LanguageClientWrapper', () => {
  let client: BaseLanguageClient;

  // this value is ignored and used only as an argument when constructing GitLabManagerForCodeSuggestions
  const fakeManager = createFakePartial<GitLabPlatformManager>({});

  let stateManager: CodeSuggestionsStateManager;

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
    stateManager = createFakePartial<CodeSuggestionsStateManager>({
      setError: jest.fn(),
    });
  });

  describe('initAndStart', () => {
    it('starts the client and synchronizes the configuration', async () => {
      const wrapper = new LanguageClientWrapper(client, fakeManager, stateManager);

      await wrapper.initAndStart();

      expect(client.registerProposedFeatures).toHaveBeenCalled();
      expect(client.start).toHaveBeenCalled();
      expect(client.sendNotification).toHaveBeenCalledWith(
        DidChangeConfigurationNotification.type,
        {
          settings: {
            baseUrl: gitlabPlatformForAccount.account.instanceUrl,
            projectPath: '',
            token: gitlabPlatformForAccount.account.token,
            telemetry: {
              actions: [{ action: TRACKING_EVENTS.ACCEPTED }],
            },
            featureFlags: {
              codeSuggestionsClientDirectToGateway: false,
              streamCodeGenerations: true,
            },
            suggestionsCache: undefined,
            logLevel: 'info',
          },
        },
      );
    });

    it('stops client when disposed', async () => {
      const wrapper = new LanguageClientWrapper(client, fakeManager, stateManager);

      await wrapper.initAndStart();
      wrapper.dispose();

      expect(client.stop).toHaveBeenCalled();
    });

    describe('inside a GitLab project', () => {
      beforeEach(() => {
        jest.mocked(GitLabPlatformManagerForCodeSuggestions).mockReturnValue(
          createFakePartial<GitLabPlatformManagerForCodeSuggestions>({
            getGitLabPlatform: async () => gitlabPlatformForProject,
          }),
        );
        client = createFakePartial<BaseLanguageClient>({
          start: jest.fn(),
          stop: jest.fn(),
          registerProposedFeatures: jest.fn(),
          onNotification: jest.fn(),
          sendNotification: jest.fn(),
        });
        stateManager = createFakePartial<CodeSuggestionsStateManager>({
          setError: jest.fn(),
        });
      });

      it('sends the project path', async () => {
        const wrapper = new LanguageClientWrapper(client, fakeManager, stateManager);

        await wrapper.initAndStart();

        expect(client.sendNotification).toHaveBeenCalledWith(
          DidChangeConfigurationNotification.type,
          {
            settings: expect.objectContaining({
              projectPath: gitlabPlatformForProject.project?.namespaceWithPath,
            }),
          },
        );
      });
    });
  });

  describe('sendSuggestionAcceptedEvent', () => {
    it('sends accepted notification', async () => {
      const wrapper = new LanguageClientWrapper(client, fakeManager, stateManager);

      // this is important step, we reference the function WITHOUT it's class instance
      // to test that we can pass it around as a command
      const { sendSuggestionAcceptedEvent } = wrapper;

      await sendSuggestionAcceptedEvent('tracking id test');

      expect(client.sendNotification).toHaveBeenCalledWith('$/gitlab/telemetry', {
        category: 'code_suggestions',
        action: TRACKING_EVENTS.ACCEPTED,
        context: { trackingId: 'tracking id test' },
      });
    });
  });

  describe('reacts on API errors', () => {
    let notificationHandlers: Record<string, GenericNotificationHandler>;

    let wrapper: LanguageClientWrapper;

    beforeEach(async () => {
      notificationHandlers = {};
      jest.mocked(client.onNotification).mockImplementation((type, handler) => {
        notificationHandlers[type] = handler;
        return { dispose: () => {} };
      });
      wrapper = new LanguageClientWrapper(client, fakeManager, stateManager);
      await wrapper.initAndStart();
    });

    it('sets error state when receiving api error notification', async () => {
      notificationHandlers[API_ERROR_NOTIFICATION]();

      expect(stateManager.setError).toHaveBeenLastCalledWith(true);
    });

    it('resets error state when receiving api recovery notification', async () => {
      notificationHandlers[API_RECOVERY_NOTIFICATION]();

      expect(stateManager.setError).toHaveBeenLastCalledWith(false);
    });
  });

  describe('syncConfig', () => {
    let subject: LanguageClientWrapper;

    beforeEach(async () => {
      subject = new LanguageClientWrapper(client, fakeManager, stateManager);
      await subject.initAndStart();

      // initAndStart() will trigger some mocks, so let's start from a clean slate
      jest.clearAllMocks();
    });

    it('reads featureFlags configuration', async () => {
      setFakeWorkspaceConfiguration({
        featureFlags: {
          codeSuggestionsClientDirectToGateway: true,
          streamCodeGenerations: false,
          // Include somethingElse to show that it is not included
          somethingElse: false,
        },
      });

      await subject.syncConfig();

      expect(client.sendNotification).toHaveBeenCalledTimes(1);
      expect(client.sendNotification).toHaveBeenCalledWith(
        DidChangeConfigurationNotification.type,
        {
          settings: expect.objectContaining({
            featureFlags: {
              codeSuggestionsClientDirectToGateway: true,
              streamCodeGenerations: false,
            },
          }),
        },
      );
    });
  });
});
