import { gql } from 'graphql-request';
import { GraphQLQuery } from './graphql_query';
import { GqlProjectResult } from '../graphql/shared';

const fragmentProjectDetails = gql`
  fragment projectDetails on Project {
    id
    name
    description
    httpUrlToRepo
    sshUrlToRepo
    fullPath
    repository {
      rootRef
      empty
    }
  }
`;

export interface GqlProjectWithRepoInfo {
  id: string;
  name: string;
  description: string;
  httpUrlToRepo: string;
  sshUrlToRepo: string;
  fullPath: string;
  repository: {
    rootRef: string;
    empty: boolean;
  };
}

const queryGetProjects = gql`
  ${fragmentProjectDetails}
  query GetProjectsWithRepositoryInfo(
    $search: String
    $membership: Boolean
    $limit: Int
    $searchNamespaces: Boolean
  ) {
    projects(
      search: $search
      membership: $membership
      first: $limit
      searchNamespaces: $searchNamespaces
    ) {
      nodes {
        ...projectDetails
      }
    }
  }
`;

const queryGetProject = gql`
  ${fragmentProjectDetails}
  query GetProjectWithRepositoryInfo($namespaceWithPath: ID!) {
    project(fullPath: $namespaceWithPath) {
      ...projectDetails
    }
  }
`;

interface GqlProjectsResult {
  projects?: {
    nodes?: GqlProjectWithRepoInfo[];
  };
}

type GetProjectQueryResult = GqlProjectResult<GqlProjectWithRepoInfo>;

export interface GetProjectsOptions {
  search?: string;
  membership: boolean;
  limit?: number;
  searchNamespaces?: boolean;
}

const SEARCH_LIMIT = 30;

const getProjectsDefaultOptions = {
  membership: true,
  limit: SEARCH_LIMIT,
  searchNamespaces: true,
};

export const getProjectsWithRepositoryInfo: (
  options: Partial<GetProjectsOptions>,
) => GraphQLQuery<GqlProjectWithRepoInfo[]> = options => ({
  query: queryGetProjects,
  processResult: (result: GqlProjectsResult) => result.projects?.nodes || [],
  options: { ...getProjectsDefaultOptions, ...options },
});

export const getProjectWithRepositoryInfo: (
  namespaceWithPath: string,
) => GraphQLQuery<GqlProjectWithRepoInfo | undefined> = namespaceWithPath => ({
  query: queryGetProject,
  processResult: (result: GetProjectQueryResult) => result.project,
  options: { namespaceWithPath },
});
