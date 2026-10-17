import * as vscode from 'vscode';
import assert from 'assert';
import { REVIEW_URI_SCHEME } from '../../constants';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { gitlabProjectRepository } from '../../gitlab/gitlab_project_repository';
import { mrCache } from '../../gitlab/mr_cache';
import { getOpenMergeRequestsForBranch } from '../../gitlab/api/get_open_merge_requests_for_branch';
import { getTrackingBranchName } from '../../git/get_tracking_branch_name';
import { DetachedHeadError } from '../../errors/detached_head_error';
import { fromReviewUri } from '../../review/review_uri';
import { mrDiffPanelController } from '../../review/side_by_side/mr_diff_panel_controller';
import { issuableController } from '../../issuable_controller';
import { issuableDataProvider } from '../../tree_view/issuable_data_provider';
import { currentBranchRefresher } from '../../current_branch_refresher';
import { getActiveProjectOrSelectOne } from '../run_with_valid_project';
import { getJiraLinkConfig } from '../../jira/jira_keys';
import { openJiraIssue } from '../../jira/open_jira_issue';
import { availableActions, describeMr, jiraActions, MrAction } from './available_actions';
import { MrActionTarget, MrState, runAction } from './run_action';

interface ActionItem extends vscode.QuickPickItem {
  action?: MrAction;
}

const isMrActionTarget = (arg: unknown): arg is MrActionTarget =>
  typeof arg === 'object' &&
  arg !== null &&
  'mr' in arg &&
  'projectInRepository' in arg &&
  !(arg instanceof vscode.Uri);

const targetFromReviewUri = (uri: vscode.Uri): MrActionTarget => {
  const { repositoryRoot, mrId } = fromReviewUri(uri);
  const projectInRepository = gitlabProjectRepository.getProjectOrFail(repositoryRoot);
  const cachedMr = mrCache.getMr(mrId, projectInRepository);
  assert(cachedMr, 'The merge request is not loaded. Refresh the side panel and try again.');
  return { mr: cachedMr.mr, projectInRepository };
};

const targetFromCurrentBranch = async (): Promise<MrActionTarget | undefined> => {
  const projectInRepository = await getActiveProjectOrSelectOne();
  if (!projectInRepository) return undefined;
  const branch = await getTrackingBranchName(projectInRepository.pointer.repository.rawRepository);
  if (!branch) throw new DetachedHeadError();
  const [mr] = await getGitLabService(projectInRepository).fetchFromApi(
    getOpenMergeRequestsForBranch(projectInRepository.project, branch),
  );
  if (!mr) {
    await vscode.window.showInformationMessage(
      `Branch ${branch} has no open merge request in ${projectInRepository.project.namespaceWithPath}.`,
    );
    return undefined;
  }
  return { mr, projectInRepository };
};

const resolveTarget = async (arg: unknown): Promise<MrActionTarget | undefined> => {
  if (isMrActionTarget(arg)) return { mr: arg.mr, projectInRepository: arg.projectInRepository };
  if (arg instanceof vscode.Uri && arg.scheme === REVIEW_URI_SCHEME) {
    return targetFromReviewUri(arg);
  }
  // VS Code passes no argument from a webview's title bar
  const webviewTarget =
    mrDiffPanelController.activeTarget() ?? issuableController.activeMergeRequest();
  if (webviewTarget) {
    const projectInRepository = gitlabProjectRepository.getProjectOrFail(
      webviewTarget.repositoryRoot,
    );
    return { mr: webviewTarget.mr, projectInRepository };
  }
  return targetFromCurrentBranch();
};

const loadState = async ({ mr, projectInRepository }: MrActionTarget): Promise<MrState> =>
  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Loading !${mr.iid}` },
    async () => {
      const service = getGitLabService(projectInRepository);
      const [detail, approvals] = await Promise.all([
        service.getMrDetail(mr),
        service.getMrApprovals(mr),
      ]);
      return { detail, approvals };
    },
  );

const toItem = (action: MrAction): ActionItem => ({
  label: `$(${action.icon}) ${action.label}`,
  description: action.unavailableReason,
  action,
});

export const toQuickPickItems = (actions: MrAction[]): ActionItem[] => {
  const available = actions.filter(a => !a.unavailableReason);
  const unavailable = actions.filter(a => a.unavailableReason);
  return [
    ...available.map(toItem),
    ...(unavailable.length
      ? [
          { label: 'Not available', kind: vscode.QuickPickItemKind.Separator },
          ...unavailable.map(a => ({ ...toItem(a), action: undefined })),
        ]
      : []),
  ];
};

const pickAction = async ({ detail, approvals }: MrState): Promise<MrAction | undefined> => {
  const actions = [
    ...availableActions(detail, approvals),
    ...jiraActions(detail, getJiraLinkConfig()),
  ];
  if (!actions.length) {
    await vscode.window.showInformationMessage(
      `!${detail.iid} is ${detail.state}; there is nothing to do on it.`,
    );
    return undefined;
  }
  const item = await vscode.window.showQuickPick(toQuickPickItems(actions), {
    title: describeMr(detail, approvals),
    placeHolder: 'Choose an action',
    matchOnDescription: true,
  });
  return item?.action;
};

const refreshViews = async (mr: RestMr) => {
  issuableDataProvider.refresh();
  mrDiffPanelController.refreshPanelsFor(mr);
  await Promise.all([issuableController.refreshMergeRequest(mr), currentBranchRefresher.refresh()]);
};

const showActions = async (target: MrActionTarget): Promise<void> => {
  const state = await loadState(target);
  const action = await pickAction(state);
  if (!action) return;
  if (action.id === 'refresh') {
    await showActions(target);
    return;
  }
  if (action.id === 'openJiraIssue') {
    await openJiraIssue(action.jiraKey);
    return;
  }
  if (await runAction(action.id, target, state)) await refreshViews(target.mr);
};

/**
 * `gl.mergeRequestActions`: shows what the user can do with a merge request and does it.
 * Takes a sidebar merge request item, a review (`gl-review`) URI, or nothing — then it uses
 * the merge request of the active side-by-side diff or Overview, or else of the current branch.
 */
export const mergeRequestActions = async (arg?: unknown): Promise<void> => {
  const target = await resolveTarget(arg);
  if (target) await showActions(target);
};
