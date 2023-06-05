import { gql } from 'graphql-request';
import { GraphQLRequest } from './graphql_request';

interface GqlGroup {
  id: string;
}

export interface GqlProject {
  id: string;
  name: string;
  description: string;
  fullPath: string;
  webUrl: string;
  group: GqlGroup;
}

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

export const getProject: (
  namespaceWithPath: string,
) => GraphQLRequest<GqlProject | undefined> = namespaceWithPath => ({
  type: 'graphql',
  query: queryGetProject,
  options: { namespaceWithPath },
  resultPath: 'project',
});
