/*
 * ------------------------------------
 * This file contains types WebIDE shares with this (and other) projects.
 * If you change this file, you MUST change it also in:
 *   - https://gitlab.com/gitlab-org/gitlab-web-ide/-/blob/main/packages/web-ide-interop/src/index.ts
 * ------------------------------------
 */

/* Mediator commands */
export const COMMAND_FETCH_FROM_API = `gitlab-web-ide.mediator.fetch-from-api`;
export const COMMAND_GET_CONFIG = `gitlab-web-ide.mediator.get-config`;

/*  Shared configuration */
export interface InteropConfig {
  projectPath: string;
}

/* API types */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface PostRequest<TReturnType> {
  type: 'rest';
  method: 'POST';
  /**
   * The request path without `/api/v4`
   * If you want to make request to `https://gitlab.example/api/v4/projects`
   * set the path to `/projects`
   */
  path: string;
  body?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface GetRequest<TReturnType> {
  type: 'rest';
  method: 'GET';
  /**
   * The request path without `/api/v4`
   * If you want to make request to `https://gitlab.example/api/v4/projects`
   * set the path to `/projects`
   */
  path: string;
  searchParams?: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface GraphQLRequest<TReturnType> {
  type: 'graphql';
  query: string;
  /** Options passed to the GraphQL query */
  variables: Record<string, unknown>;
}

export type ApiRequest<TReturnType> =
  | GetRequest<TReturnType>
  | PostRequest<TReturnType>
  | GraphQLRequest<TReturnType>;

/**
 * Makes an API request to GitLab instance.
 *
 * @template TReturnType The expected return type of the API request.
 * @param request - The API request to be made.
 * @returns A Promise that resolves with the response of the API request. The response is always an object parsed from JSON.
 */
export type fetchFromApi = <TReturnType>(request: ApiRequest<TReturnType>) => Promise<TReturnType>;
