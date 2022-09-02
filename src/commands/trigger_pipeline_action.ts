import * as vscode from 'vscode';
import { openCurrentPipeline } from './openers';
import { ProjectCommand } from './run_with_valid_project';
import { USER_COMMANDS } from '../command_names';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { getTrackingBranchName } from '../git/get_tracking_branch_name';
import { JobProvider } from '../tree_view/items/job_provider';
import { currentBranchRefresher } from '../current_branch_refresher';

type PipelineAction = 'view' | 'download' | 'create' | 'retry' | 'cancel';

export const triggerPipelineAction: ProjectCommand = async projectInRepository => {
  const items: { label: string; action: PipelineAction }[] = [
    {
      label: 'View latest pipeline on GitLab',
      action: 'view',
    },
    {
      label: 'Download artifacts from latest pipeline',
      action: 'download',
    },
    {
      label: 'Create a new pipeline from current branch',
      action: 'create',
    },
    {
      label: 'Retry last pipeline',
      action: 'retry',
    },
    {
      label: 'Cancel last pipeline',
      action: 'cancel',
    },
  ];

  const selected = await vscode.window.showQuickPick(items);

  if (selected) {
    if (selected.action === 'view') {
      await openCurrentPipeline(projectInRepository);
      return;
    }

    const { project } = projectInRepository;
    const { repository } = projectInRepository.pointer;
    const gitlabService = getGitLabService(projectInRepository);

    if (selected.action === 'create') {
      const branchName = await getTrackingBranchName(repository.rawRepository);
      const result = await gitlabService.createPipeline(branchName, project);
      if (result) await vscode.commands.executeCommand(USER_COMMANDS.REFRESH_SIDEBAR);
      return;
    }

    const branchState = await currentBranchRefresher.getOrRetrieveState();

    if (!branchState.valid || !branchState.pipeline) {
      await vscode.window.showErrorMessage('GitLab Workflow: No project or pipeline found.');
      return;
    }

    if (selected.action === 'download') {
      const jobProvider: JobProvider = {
        getJobs() {
          return branchState.jobs;
        },
      };
      await vscode.commands.executeCommand(USER_COMMANDS.DOWNLOAD_ARTIFACTS, jobProvider);
    } else {
      const result = await gitlabService.cancelOrRetryPipeline(
        selected.action,
        project,
        branchState.pipeline,
      );
      if (result) await vscode.commands.executeCommand(USER_COMMANDS.REFRESH_SIDEBAR);
    }
  }
};
