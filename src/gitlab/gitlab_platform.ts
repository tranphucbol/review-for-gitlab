import { GraphQLRequest } from './api/graphql_request';
import { GetRequest, PostRequest } from './api/rest';
import { GitLabProject } from './gitlab_project';

export type ApiRequest<T> = GetRequest<T> | PostRequest<T> | GraphQLRequest<T>;

/**
 * GitLabPlatform interface provides methods to fetch GitLab projects and make API requests.
 */
export interface GitLabPlatform {
  project: GitLabProject;

  /**
   * Makes an API request.
   *
   * @template T The expected return type of the API request.
   * @param request - The API request to be made.
   * @returns A Promise that resolves with the response of the API request.
   */
  fetchFromApi<TReturnType>(request: ApiRequest<TReturnType>): Promise<TReturnType>;
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
  getForActiveProject(userInitiated: boolean): Promise<GitLabPlatform | undefined>;
}
