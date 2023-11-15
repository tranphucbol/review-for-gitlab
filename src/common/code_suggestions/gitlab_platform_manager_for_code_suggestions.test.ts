import { GitLabPlatformForAccount, GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabPlatformManagerForCodeSuggestions } from './gitlab_platform_manager_for_code_suggestions';
import {
  account,
  gitlabPlatformForAccount,
  gitlabPlatformForProject,
} from '../test_utils/entities';
import { Account } from '../platform/gitlab_account';
import {
  getAiAssistedCodeSuggestionsConfiguration,
  setAiAssistedCodeSuggestionsConfiguration,
} from '../utils/extension_configuration';
import { GqlCurrentUser } from './api/get_code_suggestions_support';
import { createFakePartial } from '../test_utils/create_fake_partial';

jest.mock('../utils/extension_configuration');

describe('code_suggestions/GitLabPlatformForCodeSuggestions', () => {
  let platformManagerForCodeSuggestions: GitLabPlatformManagerForCodeSuggestions;
  let gitlabPlatformManager: GitLabPlatformManager;

  const buildGitLabPlatformForAccount = (useAccount: Account): GitLabPlatformForAccount => ({
    ...gitlabPlatformForAccount,
    account: useAccount,
    fetchFromApi: jest.fn().mockResolvedValueOnce({
      currentUser: {
        ide: {
          codeSuggestionsEnabled: false,
        },
      },
    }),
  });

  beforeEach(() => {
    gitlabPlatformManager = createFakePartial<GitLabPlatformManager>({
      getForActiveProject: jest.fn(),
      getForActiveAccount: jest.fn(),
      getForAllAccounts: jest.fn(),
    });

    platformManagerForCodeSuggestions = new GitLabPlatformManagerForCodeSuggestions(
      gitlabPlatformManager,
    );

    jest.mocked(getAiAssistedCodeSuggestionsConfiguration).mockReturnValueOnce({
      enabled: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when an active project is available', () => {
    beforeEach(() => {
      jest
        .mocked(gitlabPlatformManager.getForActiveProject)
        .mockResolvedValueOnce(gitlabPlatformForProject);
    });

    it('returns a gitlab platform for the active project', async () => {
      expect(await platformManagerForCodeSuggestions.getGitLabPlatform()).toBe(
        gitlabPlatformForProject,
      );
    });
  });

  describe('when an active project is not available', () => {
    beforeEach(() => {
      jest.mocked(gitlabPlatformManager.getForActiveProject).mockResolvedValueOnce(undefined);
    });

    describe('when no gitlab account is available', () => {
      beforeEach(() => {
        jest.mocked(gitlabPlatformManager.getForAllAccounts).mockResolvedValueOnce([]);
      });

      it('returns undefined', async () => {
        expect(await platformManagerForCodeSuggestions.getGitLabPlatform()).toBe(undefined);
      });
    });

    describe('when a single gitlab account is available', () => {
      let gitlabPlatformForAccount: GitLabPlatformForAccount;

      beforeEach(() => {
        gitlabPlatformForAccount = buildGitLabPlatformForAccount(account);

        jest
          .mocked(gitlabPlatformManager.getForAllAccounts)
          .mockResolvedValueOnce([gitlabPlatformForAccount]);
      });

      it('returns gitlab platform for that account', async () => {
        expect(await platformManagerForCodeSuggestions.getGitLabPlatform()).toBe(
          gitlabPlatformForAccount,
        );
      });
    });

    describe('when multiple gitlab accounts are available', () => {
      let firstGitlabPlatformForAccount: GitLabPlatformForAccount;
      let secondGitLabPlatformForAccount: GitLabPlatformForAccount;

      beforeEach(() => {
        firstGitlabPlatformForAccount = buildGitLabPlatformForAccount({
          ...account,
          username: 'first-account',
        });
        secondGitLabPlatformForAccount = buildGitLabPlatformForAccount({
          ...account,
          username: 'second-account',
        });

        jest
          .mocked(gitlabPlatformManager.getForAllAccounts)
          .mockResolvedValueOnce([firstGitlabPlatformForAccount, secondGitLabPlatformForAccount]);
      });

      describe('when the user has a preferred gitlab account', () => {
        let gitlabPlatformForPreferredAccount: GitLabPlatformForAccount;

        beforeEach(() => {
          gitlabPlatformForPreferredAccount = firstGitlabPlatformForAccount;

          jest
            .mocked(getAiAssistedCodeSuggestionsConfiguration)
            .mockReset()
            .mockReturnValueOnce({
              enabled: true,
              preferredAccount: gitlabPlatformForPreferredAccount.account?.username,
            });
        });

        it('returns the preferred account', async () => {
          expect(await platformManagerForCodeSuggestions.getGitLabPlatform()).toBe(
            gitlabPlatformForPreferredAccount,
          );
        });
      });

      describe('when the user does not have a preferred account', () => {
        describe('when an account has code suggestions enabled', () => {
          beforeEach(() => {
            // the account with code suggestions enabled
            jest
              .mocked(secondGitLabPlatformForAccount.fetchFromApi<{ currentUser: GqlCurrentUser }>)
              .mockReset()
              .mockResolvedValueOnce({
                currentUser: {
                  ide: {
                    codeSuggestionsEnabled: true,
                  },
                },
              });
          });

          it('returns account with code suggestions enabled', async () => {
            expect(await platformManagerForCodeSuggestions.getGitLabPlatform()).toBe(
              secondGitLabPlatformForAccount,
            );
          });

          it('saves account in the preferredAccount setting', async () => {
            await platformManagerForCodeSuggestions.getGitLabPlatform();

            expect(setAiAssistedCodeSuggestionsConfiguration).toHaveBeenCalledWith({
              enabled: true,
              preferredAccount: secondGitLabPlatformForAccount.account?.username,
            });
          });
        });

        describe('when no account has code suggestions enabled', () => {
          it('returns undefined', async () => {
            expect(await platformManagerForCodeSuggestions.getGitLabPlatform()).toBe(undefined);
          });
        });
      });
    });
  });
});
