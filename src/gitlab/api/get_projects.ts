import { gql } from 'graphql-request';
import { GitLabProject } from '../gitlab_project';
import { GraphQLQuery } from './graphql_query';
import { fragmentProjectDetails, GqlProject } from '../graphql/shared';

const queryGetProjects = gql`
  ${fragmentProjectDetails}
  query GetProjects(
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
        repository {
          empty
        }
      }
    }
  }
`;

interface GqlProjectsResult {
  projects?: {
    nodes?: GqlProject[];
  };
}

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

export const getProjects: (
  options: Partial<GetProjectsOptions>,
) => GraphQLQuery<GitLabProject[]> = options => ({
  query: queryGetProjects,
  processResult: (result: GqlProjectsResult) =>
    result.projects?.nodes?.map(project => new GitLabProject(project)) || [],
  options: { ...getProjectsDefaultOptions, ...options },
});
