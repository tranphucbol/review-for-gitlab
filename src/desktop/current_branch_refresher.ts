import * as vscode from 'vscode';
import dayjs from 'dayjs';
import { log } from '../common/log';
import { extensionState } from './extension_state';
import { UserFriendlyError } from './errors/user_friendly_error';
import { notNullOrUndefined } from './utils/not_null_or_undefined';
import { getActiveProject } from './commands/run_with_valid_project';
import { ProjectInRepository } from './gitlab/new_project';
import { getGitLabService } from './gitlab/get_gitlab_service';
import { getTrackingBranchName } from './git/get_tracking_branch_name';
import { getCurrentBranchName } from './git/get_current_branch';
import { GitLabService } from './gitlab/gitlab_service';
import { getTagsForHead } from './git/get_tags_for_head';
import { DetachedHeadError } from './errors/detached_head_error';
import { GqlSecurityFindingReport } from './gitlab/security_findings/api/get_security_finding_report';
import { getPipelinesForRef } from './gitlab/api/get_pipelines_for_ref';
import { getPipelineAndMrForBranch } from './gitlab/get_pipeline_and_mr_for_branch';
import { getAllSecurityReports } from './gitlab/security_findings/get_all_security_reports';
import { isEnabled, FeatureFlag } from '../common/feature_flags';

export interface BranchState {
  type: 'branch';
  projectInRepository: ProjectInRepository;
  mr?: RestMr;
  issues: RestIssuable[];
  pipeline?: RestPipeline;
  jobs: RestJob[];
  userInitiated: boolean;
  securityFindings?: GqlSecurityFindingReport;
}

export interface TagState {
  type: 'tag';
  projectInRepository: ProjectInRepository;
  pipeline?: RestPipeline;
  jobs: RestJob[];
  userInitiated: boolean;
}

export interface InvalidState {
  type: 'invalid';
  error?: Error;
}

export type TreeState = BranchState | TagState | InvalidState;

const INVALID_STATE: InvalidState = { type: 'invalid' };

const getJobs = async (
  projectInRepository: ProjectInRepository,
  pipeline?: RestPipeline,
): Promise<RestJob[]> => {
  if (!pipeline) return [];
  try {
    const projectId = projectInRepository.project.restId;
    const service = getGitLabService(projectInRepository);

    const pipelinePromise = service.getJobsForPipeline(pipeline.id, projectId);
    const bridgesPromise = service.getTriggerJobsForPipeline(pipeline.id, projectId);
    const statusPromise = service.getExternalStatusForCommit(pipeline.sha, pipeline.ref, projectId);
    return [...(await pipelinePromise), ...(await bridgesPromise), ...(await statusPromise)];
  } catch (e) {
    log.error(new UserFriendlyError('Failed to fetch jobs for pipeline.', e));
    return [];
  }
};

export class CurrentBranchRefresher {
  private refreshTimer?: NodeJS.Timeout;

  private branchTrackingTimer?: NodeJS.Timeout;

  #stateChangedEmitter = new vscode.EventEmitter<TreeState>();

  onStateChanged = this.#stateChangedEmitter.event;

  private lastRefresh = dayjs().subtract(1, 'minute');

  private previousBranchName = '';

  private latestState: TreeState = INVALID_STATE;

  init() {
    this.clearAndSetInterval();
    extensionState.onDidChangeValid(() => this.clearAndSetIntervalAndRefresh());
    vscode.window.onDidChangeWindowState(async state => {
      if (!state.focused) {
        return;
      }
      if (dayjs().diff(this.lastRefresh, 'second') > 30) {
        await this.clearAndSetIntervalAndRefresh();
      }
    });
    // This polling is not ideal. The alternative is to listen on repository state
    // changes. The logic becomes much more complex and the state changes
    // (Repository.state.onDidChange()) are triggered many times per second.
    // We wouldn't save any CPU cycles, just increased the complexity of this extension.
    this.branchTrackingTimer = setInterval(async () => {
      const projectInRepository = getActiveProject();
      const currentBranch =
        projectInRepository &&
        getCurrentBranchName(projectInRepository.pointer.repository.rawRepository);
      if (currentBranch && currentBranch !== this.previousBranchName) {
        this.previousBranchName = currentBranch;
        await this.clearAndSetIntervalAndRefresh();
      }
    }, 1000);
  }

  async clearAndSetIntervalAndRefresh(): Promise<void> {
    await this.clearAndSetInterval();
    await this.refresh();
  }

  clearAndSetInterval(): void {
    global.clearInterval(this.refreshTimer!);
    this.refreshTimer = setInterval(async () => {
      if (!vscode.window.state.focused) return;
      await this.refresh();
    }, 30000);
  }

  async refresh(userInitiated = false) {
    const projectInRepository = getActiveProject();
    this.latestState = await CurrentBranchRefresher.getState(projectInRepository, userInitiated);
    this.#stateChangedEmitter.fire(this.latestState);
    this.lastRefresh = dayjs();
  }

  async getOrRetrieveState(): Promise<TreeState> {
    if (this.latestState.type === 'invalid') {
      await this.refresh(false);
    }
    return this.latestState;
  }

  static async getPipelineAndMrForHead(
    gitLabService: GitLabService,
    projectInRepository: ProjectInRepository,
  ): Promise<{ type: 'tag' | 'branch'; pipeline?: RestPipeline; mr?: RestMr }> {
    const { rawRepository } = projectInRepository.pointer.repository;
    const branchName = await getTrackingBranchName(rawRepository);
    if (branchName) {
      const { pipeline, mr } = await getPipelineAndMrForBranch(
        gitLabService,
        projectInRepository.project,
        branchName,
      );
      return { type: 'branch', pipeline, mr };
    }
    const tags = await getTagsForHead(rawRepository);
    if (tags.length === 1) {
      const pipelines = await gitLabService.fetchFromApi(
        getPipelinesForRef(projectInRepository.project, tags[0]),
      );
      return {
        type: 'tag',
        pipeline: pipelines[0],
      };
    }
    throw new DetachedHeadError(tags);
  }

  static async getState(
    projectInRepository: ProjectInRepository | undefined,
    userInitiated: boolean,
  ): Promise<TreeState> {
    if (!projectInRepository) return INVALID_STATE;
    const { project } = projectInRepository;
    const gitLabService = getGitLabService(projectInRepository);
    let securityFindings;
    try {
      const { type, pipeline, mr } = await CurrentBranchRefresher.getPipelineAndMrForHead(
        gitLabService,
        projectInRepository,
      );
      const jobs = await getJobs(projectInRepository, pipeline);
      const minimalIssues = mr ? await gitLabService.getMrClosingIssues(project, mr.iid) : [];
      if (mr && isEnabled(FeatureFlag.SecurityScans)) {
        securityFindings = await getAllSecurityReports(
          gitLabService,
          projectInRepository.project,
          mr,
        );
      }

      const issues = (
        await Promise.all(
          minimalIssues
            .map(mi => mi.iid)
            .filter(notNullOrUndefined)
            .map(iid => gitLabService.getSingleProjectIssue(project, iid)),
        )
      ).filter(notNullOrUndefined);
      return {
        type,
        projectInRepository,
        pipeline,
        mr,
        jobs,
        issues,
        userInitiated,
        securityFindings,
      };
    } catch (e) {
      log.error(e);
      return { type: 'invalid', error: e };
    }
  }

  stopTimers(): void {
    global.clearInterval(this.refreshTimer!);
    global.clearInterval(this.branchTrackingTimer!);
  }

  dispose() {
    this.stopTimers();
    this.#stateChangedEmitter.dispose();
  }
}

export const currentBranchRefresher = new CurrentBranchRefresher();
