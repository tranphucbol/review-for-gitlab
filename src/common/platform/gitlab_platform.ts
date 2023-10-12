import { fetchFromApi } from './web_ide';
import { GitLabProject } from './gitlab_project';
import { Account } from './gitlab_account';

/**
 * GitLabPlatform interface provides methods to fetch GitLab projects and make API requests.
 */
export interface GitLabPlatformBase {
  fetchFromApi: fetchFromApi;

  /**
   * What user agent should be used for API calls that are not made to GitLab API
   * (e.g. when calling Model Gateway for code suggestions)
   */
  getUserAgentHeader(): Record<string, string>;

  isTelemetryEnabled(): boolean;
}

export interface GitLabPlatformForActiveProject extends GitLabPlatformBase {
  type: 'project';
  project: GitLabProject;
}

export interface GitLabPlatformForAccount extends GitLabPlatformBase {
  type: 'account';
  account?: Account;
}

export interface GitLabPlatformManager {
  /**
   * Returns GitLabPlatform for the active project
   *
   * This is how we decide what is "active project":
   *   - if there is only one Git repository opened, we always return GitLab project associated with that repository
   *   - if there are multiple Git repositories opened, we return the one associated with the active editor
   *     - if there isn't active editor, we will return undefined if `userInitiated` is false, or we ask user to select one if user initiated is `true`
   *
   * @param userInitiated - Indicates whether the user initiated the action.
   * @returns A Promise that resolves with the fetched GitLabProject or undefined if an active project does not exist.
   */
  getForActiveProject(userInitiated: boolean): Promise<GitLabPlatformForActiveProject | undefined>;

  /**
   * Returns a GitLabPlatform for the active account
   *
   * This is how we decide what is "active account":
   *  - If the user has signed in to a single GitLab account, it will return that account.
   *  - If the user has signed in to multiple GitLab accounts, a UI picker will request the user to choose the desired account.
   */
  getForActiveAccount(): Promise<GitLabPlatformForAccount | undefined>;

  getForAllAccounts(): Promise<GitLabPlatformForAccount[]>;
}
