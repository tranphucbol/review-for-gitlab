import * as vscode from 'vscode';
import assert from 'assert';
import dayjs from 'dayjs';
import { log } from './log';
import { extensionState } from './extension_state';
import { StatusBar } from './status_bar';
import { CurrentBranchDataProvider } from './tree_view/current_branch_data_provider';
import { UserFriendlyError } from './errors/user_friendly_error';
import { notNullOrUndefined } from './utils/not_null_or_undefined';
import { getActiveProject } from './commands/run_with_valid_project';
import { ProjectInRepository } from './gitlab/new_project';
import { getGitLabService } from './gitlab/get_gitlab_service';
import { getTrackingBranchName } from './git/get_tracking_branch_name';
import { getCurrentBranchName } from './git/get_current_branch';

export interface ValidBranchState {
  valid: true;
  projectInRepository: ProjectInRepository;
  mr?: RestMr;
  issues: RestIssuable[];
  pipeline?: RestPipeline;
  jobs: RestJob[];
  userInitiated: boolean;
}

export interface InvalidBranchState {
  valid: false;
  error?: Error;
}

export type BranchState = ValidBranchState | InvalidBranchState;

const INVALID_STATE: InvalidBranchState = { valid: false };

const getJobs = async (
  projectInRepository: ProjectInRepository,
  pipeline?: RestPipeline,
): Promise<RestJob[]> => {
  if (!pipeline) return [];
  try {
    return await getGitLabService(projectInRepository).getJobsForPipeline(pipeline);
  } catch (e) {
    log.error(new UserFriendlyError('Failed to fetch jobs for pipeline.', e));
    return [];
  }
};

export class CurrentBranchRefresher {
  private refreshTimer?: NodeJS.Timeout;

  private branchTrackingTimer?: NodeJS.Timeout;

  private statusBar?: StatusBar;

  private currentBranchProvider?: CurrentBranchDataProvider;

  private lastRefresh = dayjs().subtract(1, 'minute');

  private previousBranchName = '';

  private latestState: BranchState = INVALID_STATE;

  init(statusBar: StatusBar, currentBranchProvider: CurrentBranchDataProvider) {
    this.statusBar = statusBar;
    this.currentBranchProvider = currentBranchProvider;
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
    assert(this.statusBar);
    assert(this.currentBranchProvider);
    const projectInRepository = getActiveProject();
    this.latestState = await CurrentBranchRefresher.getState(projectInRepository, userInitiated);
    await this.statusBar.refresh(this.latestState);
    this.currentBranchProvider.refresh(this.latestState);
    this.lastRefresh = dayjs();
  }

  async getOrRetrieveState(): Promise<BranchState> {
    if (!this.latestState.valid) {
      await this.refresh(false);
    }
    return this.latestState;
  }

  static async getState(
    projectInRepository: ProjectInRepository | undefined,
    userInitiated: boolean,
  ): Promise<BranchState> {
    if (!projectInRepository) return INVALID_STATE;
    const { project } = projectInRepository;
    const { rawRepository } = projectInRepository.pointer.repository;
    const gitLabService = getGitLabService(projectInRepository);
    try {
      const { pipeline, mr } = await gitLabService.getPipelineAndMrForCurrentBranch(
        projectInRepository.project,
        await getTrackingBranchName(rawRepository),
      );
      const jobs = await getJobs(projectInRepository, pipeline);
      const minimalIssues = mr ? await gitLabService.getMrClosingIssues(project, mr.iid) : [];
      const issues = (
        await Promise.all(
          minimalIssues
            .map(mi => mi.iid)
            .filter(notNullOrUndefined)
            .map(iid => gitLabService.getSingleProjectIssue(project, iid)),
        )
      ).filter(notNullOrUndefined);
      return { valid: true, projectInRepository, pipeline, mr, jobs, issues, userInitiated };
    } catch (e) {
      log.error(e);
      return { valid: false, error: e };
    }
  }

  stopTimers(): void {
    global.clearInterval(this.refreshTimer!);
    global.clearInterval(this.branchTrackingTimer!);
  }

  dispose() {
    this.stopTimers();
  }
}

export const currentBranchRefresher = new CurrentBranchRefresher();
