import { gql } from 'graphql-request';
import { GitLabProject } from '../../../../common/platform/gitlab_project';
import { GraphQLRequest } from '../../../../common/platform/web_ide';

export type GqlSecurityFinding = {
  project: {
    id: string;
    pipeline: {
      id: string;
      securityReportFinding: {
        id: string;
        title: string;
        description: string;
        severity: string;
      };
    };
  };
};

export type GqlsecurityReportFinding =
  GqlSecurityFinding['project']['pipeline']['securityReportFinding'];

export const querySecurityFinding = gql`
  query pipelineFinding($fullPath: ID!, $pipelineId: ID!, $findingUuid: String!) {
    project(fullPath: $fullPath) {
      id
      pipeline(iid: $pipelineId) {
        id
        name
        securityReportFinding(uuid: $findingUuid) {
          title
          description
          severity
          scanner {
            name
          }
          reportType
        }
      }
    }
  }
`;

export const getSecurityFinding: (
  project: GitLabProject,
  pipelineId: string,
  findingUuid: string,
) => GraphQLRequest<GqlSecurityFinding> = (project, pipelineId, findingUuid) => ({
  type: 'graphql',
  query: querySecurityFinding,
  variables: {
    fullPath: project.namespaceWithPath,
    pipelineId,
    findingUuid,
  },
});
