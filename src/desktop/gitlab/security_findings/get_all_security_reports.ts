import { GitLabProject } from '../../../common/platform/gitlab_project';
import { UserFriendlyError } from '../../errors/user_friendly_error';
import { notNullOrUndefined } from '../../utils/not_null_or_undefined';
import { GitLabService } from '../gitlab_service';
import { log } from '../../../common/log';
import {
  GqlSecurityFindingReport,
  getSecurityFindingsReport,
  reportTypes,
} from './api/get_security_finding_report';
import { REQUIRED_VERSIONS } from '../../constants';

/**
 * Merges added and fixed findings from from the two reports.
 * Only `added` and `fixed` properties are merged, other values are used from the `target` report.
 */
const mergeReports = (
  target: GqlSecurityFindingReport,
  source: GqlSecurityFindingReport,
): GqlSecurityFindingReport => ({
  ...target,
  fixed: [...target.fixed, ...source.fixed],
  added: [...target.added, ...source.added],
});

export const getAllSecurityReports = async (
  gitlabService: GitLabService,
  project: GitLabProject,
  mr: RestMr,
): Promise<GqlSecurityFindingReport | undefined> => {
  try {
    await gitlabService.validateVersion('Security Findings', REQUIRED_VERSIONS.SECURITY_FINDINGS);
  } catch (e) {
    log.warn(e);
    return undefined;
  }

  try {
    // We cannot batch queries at the moment, and we can't pass in multiple report types in one query
    const reports = await Promise.all(
      reportTypes.map(t => gitlabService.fetchFromApi(getSecurityFindingsReport(project, mr, t))),
    );
    const findings = reports
      ?.map(r => r?.project.mergeRequest.findingReportsComparer?.report)
      .filter(notNullOrUndefined);

    if (!findings?.length) return undefined;
    return findings.reduce((acc, report) => mergeReports(acc, report));
  } catch (e) {
    throw new UserFriendlyError(
      `Couldn't request Security Report. For more information, review the extension logs.`,
      e,
    );
  }
};
