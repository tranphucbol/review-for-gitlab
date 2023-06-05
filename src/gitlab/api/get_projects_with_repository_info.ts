import { gql } from 'graphql-request';
import { GraphQLRequest } from './graphql_request';

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
) => GraphQLRequest<GqlProjectWithRepoInfo[] | undefined> = options => ({
  type: 'graphql',
  query: queryGetProjects,
  options: { ...getProjectsDefaultOptions, ...options },
  resultPath: 'projects.nodes',
});

export const getProjectWithRepositoryInfo: (
  namespaceWithPath: string,
) => GraphQLRequest<GqlProjectWithRepoInfo | undefined> = namespaceWithPath => ({
  type: 'graphql',
  query: queryGetProject,
  options: { namespaceWithPath },
  resultPath: 'project',
});
