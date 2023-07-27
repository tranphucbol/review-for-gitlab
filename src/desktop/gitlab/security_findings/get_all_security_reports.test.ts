import { getAllSecurityReports } from './get_all_security_reports';
import { securityReport, mr } from '../../test_utils/entities';
import { project } from '../../../common/test_utils/entities';
import { GitLabService } from '../gitlab_service';
import {
  GetSecurityFindingsReportQuery,
  reportTypes,
  querySecurityFindingReport,
} from './api/get_security_finding_report';
import { ApiRequest } from '../../../common/platform/web_ide';
import { UserFriendlyError } from '../../errors/user_friendly_error';

jest.mock('../gitlab_service');

const createMockGitLabService = (): jest.Mocked<GitLabService> => {
  const partialService: jest.Mocked<Partial<GitLabService>> = {
    fetchFromApi: jest.fn().mockResolvedValue(undefined),
    validateVersion: jest.fn().mockResolvedValue(undefined),
  };

  return partialService as jest.Mocked<GitLabService>;
};

const createTestResponse = (): GetSecurityFindingsReportQuery => ({
  project: {
    mergeRequest: {
      findingReportsComparer: {
        status: 'test',
        report: securityReport,
      },
    },
  },
});

describe('getAllSecurityReports', () => {
  let service: jest.Mocked<GitLabService>;

  beforeEach(() => {
    service = createMockGitLabService();
  });

  it('returns merged reports of all the types', async () => {
    service.fetchFromApi.mockImplementation(() => Promise.resolve(createTestResponse()));

    expect(service.fetchFromApi).not.toHaveBeenCalled();

    const expectedCalls: [ApiRequest<unknown>][] = reportTypes.map(reportType => [
      {
        type: 'graphql',
        query: querySecurityFindingReport,
        variables: {
          fullPath: project.namespaceWithPath,
          mergeRequestIid: mr.iid.toString(),
          reportType,
        },
      },
    ]);
    const result = await getAllSecurityReports(service, project, mr);

    expect(service.fetchFromApi.mock.calls).toEqual(expectedCalls);
    expect(result).toEqual({
      ...securityReport,
      added: reportTypes.flatMap(() => securityReport.added),
      fixed: reportTypes.flatMap(() => securityReport.fixed),
    });
  });

  it('throws when one of the fetches fails', async () => {
    const testError = new Error('test');
    service.fetchFromApi.mockRejectedValue(testError);

    await expect(getAllSecurityReports(service, project, mr)).rejects.toThrow(
      new UserFriendlyError(
        `Couldn't request Security Report. For more information, review the extension logs.`,
        testError,
      ),
    );
  });

  it('checks minimum gitlab instance version', async () => {
    const testError = new Error('test');
    service.validateVersion.mockRejectedValue(testError);

    await expect(getAllSecurityReports(service, project, mr)).rejects.toThrow(
      new UserFriendlyError('test', testError),
    );

    expect(service.validateVersion).toHaveBeenCalledWith('Security Findings', '16.1.0');
  });
});
