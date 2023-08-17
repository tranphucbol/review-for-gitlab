import { BranchState, CurrentBranchRefresher, TagState } from './current_branch_refresher';
import { asMock } from './test_utils/as_mock';
import {
  pipeline,
  mr,
  issue,
  job,
  projectInRepository,
  externalStatus,
  securityReport,
} from './test_utils/entities';
import { getGitLabService } from './gitlab/get_gitlab_service';
import { getTrackingBranchName } from './git/get_tracking_branch_name';
import { getTagsForHead } from './git/get_tags_for_head';
import { getExtensionConfiguration } from '../common/utils/extension_configuration';
import { getPipelineAndMrForBranch } from './gitlab/get_pipeline_and_mr_for_branch';
import { getAllSecurityReports } from './gitlab/security_findings/get_all_security_reports';

jest.mock('../common/utils/extension_configuration');
jest.mock('./gitlab/get_gitlab_service');
jest.mock('./git/get_tracking_branch_name');
jest.mock('./git/get_tags_for_head');
jest.mock('./gitlab/get_pipeline_and_mr_for_branch');
jest.mock('./gitlab/security_findings/get_all_security_reports');

describe('CurrentBranchRefrehser', () => {
  beforeEach(() => {
    asMock(getExtensionConfiguration).mockReturnValue({ featureFlags: {} });
  });

  describe('invalid state', () => {
    it('returns invalid state if the current repo does not contain GitLab project', async () => {
      const state = await CurrentBranchRefresher.getState(undefined, false);
      expect(state.type).toBe('invalid');
    });

    it('returns invalid state if fetching the mr and pipelines fails', async () => {
      asMock(getGitLabService).mockReturnValue({
        getPipelineAndMrForCurrentBranch: () => Promise.reject(new Error()),
      });
      asMock(getTrackingBranchName).mockResolvedValue('branch');
      const state = await CurrentBranchRefresher.getState(projectInRepository, false);
      expect(state.type).toBe('invalid');
    });
  });

  describe('valid state', () => {
    beforeEach(() => {
      asMock(getGitLabService).mockReturnValue({
        getMrClosingIssues: () => [{ iid: 123 }],
        getSingleProjectIssue: () => issue,
        getJobsForPipeline: () => [job],
        getExternalStatusForCommit: () => [externalStatus],
        fetchFromApi: () => [pipeline],
      });

      jest.mocked(getPipelineAndMrForBranch).mockResolvedValue({ pipeline, mr });
    });

    it('returns valid state if GitLab service returns pipeline and mr', async () => {
      asMock(getTrackingBranchName).mockResolvedValue('branch');
      const state = await CurrentBranchRefresher.getState(projectInRepository, false);

      const branchState = state as BranchState;
      expect(branchState.pipeline).toEqual(pipeline);
      expect(branchState.mr).toEqual(mr);
      expect(branchState.issues).toEqual([issue]);
      expect(branchState.securityFindings).toEqual(undefined);
    });

    it('returns valid state if GitLab service returns pipeline and mr and security scans', async () => {
      asMock(getTrackingBranchName).mockResolvedValue('branch');
      asMock(getAllSecurityReports).mockReturnValue(securityReport);

      const state = await CurrentBranchRefresher.getState(projectInRepository, false);

      const branchState = state as BranchState;
      expect(branchState.pipeline).toEqual(pipeline);
      expect(branchState.mr).toEqual(mr);
      expect(branchState.issues).toEqual([issue]);
      expect(branchState.securityFindings).toEqual(securityReport);
    });

    it('returns valid state if repository has checked out a tag', async () => {
      asMock(getTrackingBranchName).mockResolvedValue(undefined);
      asMock(getTagsForHead).mockResolvedValue(['tag1']);
      const state = await CurrentBranchRefresher.getState(projectInRepository, false);

      expect(state.type).toBe('tag');
      expect((state as TagState).pipeline).toEqual(pipeline);
    });

    it('returns pipeline jobs and external statuses', async () => {
      asMock(getTrackingBranchName).mockResolvedValue('branch');
      const state = await CurrentBranchRefresher.getState(projectInRepository, false);

      expect(state.type).toBe('branch');
      expect((state as BranchState).jobs).toEqual([job, externalStatus]);
    });
  });
});
