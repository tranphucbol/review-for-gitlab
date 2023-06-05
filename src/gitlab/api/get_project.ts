import { gql } from 'graphql-request';
import { GqlProject, GitLabProject } from '../gitlab_project';
import { GraphQLQuery } from './graphql_query';
import { GqlProjectResult } from '../graphql/shared';

const fragmentProjectDetails = gql`
  fragment projectDetails on Project {
    id
    name
    description
    fullPath
    webUrl
    group {
      id
    }
  }
`;
const queryGetProject = gql`
  ${fragmentProjectDetails}
  query GetProject($namespaceWithPath: ID!) {
    project(fullPath: $namespaceWithPath) {
      ...projectDetails
    }
  }
`;

type GetProjectQueryResult = GqlProjectResult<GqlProject>;

export const getProject: (
  namespaceWithPath: string,
) => GraphQLQuery<GitLabProject | undefined> = namespaceWithPath => ({
  query: queryGetProject,
  processResult: (result: GetProjectQueryResult) =>
    result.project && new GitLabProject(result.project),
  options: { namespaceWithPath },
});
