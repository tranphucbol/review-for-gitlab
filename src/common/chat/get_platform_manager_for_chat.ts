import { GitLabPlatformManager, GitLabPlatformForAccount } from '../platform/gitlab_platform';
import { getChatSupport } from './api/get_chat_support';

export class GitLabPlatformManagerForChat {
  readonly #platformManager: GitLabPlatformManager;

  constructor(platformManager: GitLabPlatformManager) {
    this.#platformManager = platformManager;
  }

  /**
   * Obtains a GitLab Platform to send API requests to the GitLab API
   * for the Duo Chat feature.
   *
   * - It returns a GitLabPlatformForAccount for the first linked account.
   * - It returns undefined if there are no accounts linked
   */
  async getGitLabPlatform(): Promise<GitLabPlatformForAccount | undefined> {
    const platforms = await this.#platformManager.getForAllAccounts();

    if (!platforms.length) {
      return undefined;
    }

    let platform: GitLabPlatformForAccount | undefined;

    // Using a for await loop in this context because we want to stop
    // evaluating accounts as soon as we find one with code suggestions enabled
    for await (const result of platforms.map(getChatSupport)) {
      if (result.hasSupportForChat) {
        platform = result.platform;
        break;
      }
    }

    return platform;
  }
}
