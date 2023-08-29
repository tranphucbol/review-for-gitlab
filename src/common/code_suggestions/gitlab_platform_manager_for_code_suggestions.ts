import {
  GitLabPlatformManager,
  GitLabPlatformForAccount,
  GitLabPlatformForActiveProject,
} from '../platform/gitlab_platform';
import {
  getAiAssistedCodeSuggestionsConfiguration,
  setAiAssistedCodeSuggestionsConfiguration,
} from '../utils/extension_configuration';
import { getCodeSuggestionsSupport } from './api/get_code_suggestions_support';

const supportsCodeSuggestions = async (platform: GitLabPlatformForAccount) => {
  let codeSuggestionsEnabled;

  try {
    const result = await platform.fetchFromApi(getCodeSuggestionsSupport());

    codeSuggestionsEnabled = result.currentUser.ide.codeSuggestionsEnabled;
  } catch (e) {
    codeSuggestionsEnabled = false;
  }

  return { platform, codeSuggestionsEnabled };
};

export class GitLabPlatformManagerForCodeSuggestions {
  readonly #platformManager: GitLabPlatformManager;

  constructor(platformManager: GitLabPlatformManager) {
    this.#platformManager = platformManager;
  }

  /**
   * Obtains a GitLab Platform to send API requests to the GitLab API
   * for the code suggestions feature. It follows this logic to decide
   * the correct platform to use:
   *
   * - It returns a GitLabPlatformForActiveProject if a GitLab project is available.
   * - It returns a GitLabPlatformForAccount if a GitLab account is found with
   * code suggestions support.
   * - If two or more GitLab accounts with code suggestions support are available,
   *  you can specify you preferred account using the "preferredAccount" key.
   * - Otherwise, it returns undefined
   *
   * @returns GitLabPlatformForActiveProject | GitLabPlaformForAccount
   */
  async getGitLabPlatform(): Promise<
    GitLabPlatformForActiveProject | GitLabPlatformForAccount | undefined
  > {
    const projectPlatform = await this.#platformManager.getForActiveProject(false);
    const codeSuggestionsConfig = getAiAssistedCodeSuggestionsConfiguration();

    if (projectPlatform) {
      return projectPlatform;
    }

    const platforms = await this.#platformManager.getForAllAccounts();

    if (platforms.length === 0) {
      return undefined;
    }

    if (platforms.length === 1) {
      return platforms[0];
    }

    let preferredPlatform = platforms.find(
      platform => platform.account?.username === codeSuggestionsConfig.preferredAccount,
    );

    if (preferredPlatform) {
      return preferredPlatform;
    }

    // Using a for await loop in this context because we want to stop
    // evaluating accounts as soon as we find one with code suggestions enabled
    // eslint-disable-next-line no-restricted-syntax
    for await (const result of platforms.map(supportsCodeSuggestions)) {
      if (result.codeSuggestionsEnabled) {
        preferredPlatform = result.platform;
        break;
      }
    }

    if (preferredPlatform?.account) {
      await setAiAssistedCodeSuggestionsConfiguration({
        ...codeSuggestionsConfig,
        preferredAccount: preferredPlatform.account.username,
      });
    }

    return preferredPlatform;
  }
}
