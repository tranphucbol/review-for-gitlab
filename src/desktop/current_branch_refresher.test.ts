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
import { SECURITY_SCANS_FEATURE_FLAG } from './constants';

jest.mock('../common/utils/extension_configuration');
jest.mock('./gitlab/get_gitlab_service');
jest.mock('./git/get_tracking_branch_name');
jest.mock('./git/get_tags_for_head');

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
        getPipelineAndMrForCurrentBranch: () => ({ pipeline, mr }),
        getLastPipelineForCurrentBranch: () => pipeline,
        getJobsForPipeline: () => [job],
        getExternalStatusForCommit: () => [externalStatus],
        getSecurityFindingReport: () => securityReport,
      });
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

    it('returns valid state if GitLab service returns pipeline and mr and security scans feature flag is on', async () => {
      asMock(getTrackingBranchName).mockResolvedValue('branch');
      asMock(getExtensionConfiguration).mockReturnValue({
        featureFlags: { [SECURITY_SCANS_FEATURE_FLAG]: true },
      });
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
