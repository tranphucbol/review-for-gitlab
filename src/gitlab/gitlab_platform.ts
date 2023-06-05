import { GraphQLRequest } from './api/graphql_request';
import { GetRequest, PostRequest } from './api/rest';

export type ApiRequest<T> = GetRequest<T> | PostRequest<T> | GraphQLRequest<T>;

export interface GitLabPlatformProject {
  project: string;
}

/**
 * GitLabPlatform interface provides methods to fetch GitLab projects and make API requests.
 */
export interface GitLabPlatform {
  /**
   * Fetches the current project. If `userInitiated` is true, the user initiated the action and the action might interrupt the user with questions.
   *
   * @param userInitiated - Indicates whether the user initiated the action.
   * @returns A Promise that resolves with the fetched GitLabProject or undefined if an active project does not exist.
   */
  getProject(userInitiated: boolean): Promise<GitLabPlatformProject | undefined>;

  /**
   * Makes an API request. If `userInitiated` is true, the user initiated the action and the action might interrupt the user with questions.
   *
   * @template T The expected return type of the API request.
   * @param request - The API request to be made.
   * @param project - The GitLab platform project return when calling `getProject`
   * @returns A Promise that resolves with the response of the API request.
   */
  fetchFromApi<TReturnType>(
    request: ApiRequest<TReturnType>,
    project: GitLabPlatformProject,
  ): Promise<TReturnType>;
}
