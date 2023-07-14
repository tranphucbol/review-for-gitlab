import { gql } from 'graphql-request';
import { GitLabProject } from '../../../../common/platform/gitlab_project';
import { GraphQLRequest } from '../../../../common/platform/web_ide';
import { GqlVulnerbilitySeverity } from '../../graphql/get_security_finding';

export const reportTypes = [
  'SAST',
  'SECRET_DETECTION',
  'CONTAINER_SCANNING',
  'DEPENDENCY_SCANNING',
  'DAST',
  'COVERAGE_FUZZING',
  'API_FUZZING',
] as const;

export type SecurityReportType = (typeof reportTypes)[number];

export type GetSecurityFindingsReportQuery = {
  project: {
    mergeRequest: {
      findingReportsComparer: {
        status: string;
        report: {
          baseReportCreatedAt: string;
          baseReportOutOfDate: string;
          headReportCreatedAt: string;
          added: {
            uuid: string;
            title: string;
            description: string;
            severity: string;
            foundByPipelineIid: string;
          }[];
          fixed: {
            uuid: string;
            title: string;
            description: string;
            severity: GqlVulnerbilitySeverity;
            foundByPipelineIid: string;
          }[];
        };
      };
    };
  };
};

export type GqlSecurityFinding =
  GetSecurityFindingsReportQuery['project']['mergeRequest']['findingReportsComparer']['report']['added'][number];

export type GqlSecurityFindingReport =
  GetSecurityFindingsReportQuery['project']['mergeRequest']['findingReportsComparer']['report'];

export const querySecurityFindingReport = gql`
  query getMRSecurityReport(
    $fullPath: ID!
    $mergeRequestIid: String!
    $reportType: ComparableSecurityReportType!
  ) {
    project(fullPath: $fullPath) {
      mergeRequest(iid: $mergeRequestIid) {
        title
        findingReportsComparer(reportType: $reportType) {
          status
          report {
            headReportCreatedAt
            baseReportCreatedAt
            baseReportOutOfDate
            added {
              uuid
              title
              description
              severity
              foundByPipelineIid
            }
            fixed {
              uuid
              title
              description
              severity
              foundByPipelineIid
            }
          }
        }
      }
    }
  }
`;

export const getSecurityFindingsReport: (
  project: GitLabProject,
  mr: RestMr,
  reportType: SecurityReportType,
) => GraphQLRequest<GetSecurityFindingsReportQuery> = (project, mr, reportType) => ({
  type: 'graphql',
  query: querySecurityFindingReport,
  variables: {
    fullPath: project.namespaceWithPath,
    mergeRequestIid: mr.iid.toString(),
    reportType,
  },
});
