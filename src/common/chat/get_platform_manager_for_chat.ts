import { GitLabPlatformManager, GitLabPlatformForAccount } from '../platform/gitlab_platform';

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

    if (platforms.length === 0) {
      return undefined;
    }

    return platforms[0];
  }
}
