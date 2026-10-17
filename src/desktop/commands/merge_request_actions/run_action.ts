import * as vscode from 'vscode';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { GitLabService } from '../../gitlab/gitlab_service';
import { ProjectInRepository } from '../../gitlab/new_project';
import { FetchError } from '../../errors/fetch_error';
import { openUrl } from '../openers';
import { MrActionId, mergeBlocker } from './available_actions';

export interface MrActionTarget {
  mr: RestMr;
  projectInRepository: ProjectInRepository;
}

export interface MrState {
  detail: RestMrDetail;
  approvals: RestMrApprovals;
}

export const SQUASH_COMMITS = 'Squash commits';
export const DELETE_SOURCE_BRANCH = 'Delete source branch';
export const OPEN_IN_GITLAB = 'Open in GitLab';

/** `true` when the action ran or failed in a way that changed what we know, so views reload */
type ActionResult = boolean;

const ref = (detail: RestMrDetail) => `!${detail.iid}`;

const statusOf = (e: unknown): number | undefined =>
  e instanceof FetchError ? e.status : undefined;

const confirm = async (message: string, detail: string, action: string): Promise<boolean> =>
  (await vscode.window.showWarningMessage(message, { modal: true, detail }, action)) === action;

/**
 * Maps the responses GitLab 13.12 gives to a refused write. Returns `undefined` when the
 * error isn't one of them and should propagate to `wrapCommandWithCatch`.
 */
const explainRefusal = async (
  e: unknown,
  service: GitLabService,
  detail: RestMrDetail,
  verb: string,
): Promise<ActionResult | undefined> => {
  const status = statusOf(e);
  if (status === 401) {
    // 13.12 answers 401 both to a bad token and to a refused action, with the same body.
    // A GET that succeeds proves the token is fine, so the action itself was refused.
    try {
      await service.getMrDetail(detail);
    } catch {
      return undefined;
    }
    await vscode.window.showWarningMessage(`You are not allowed to ${verb} ${ref(detail)}.`);
    return true;
  }
  if (status === 409) {
    await vscode.window.showWarningMessage(
      `New commits were pushed to ${ref(detail)}. Review them, then try again.`,
    );
    return true;
  }
  return undefined;
};

const withRefusals = async (
  { projectInRepository }: MrActionTarget,
  detail: RestMrDetail,
  verb: string,
  action: (service: GitLabService) => Promise<ActionResult>,
  handleStatus?: (
    status: number | undefined,
    service: GitLabService,
  ) => Promise<ActionResult | undefined>,
): Promise<ActionResult> => {
  const service = getGitLabService(projectInRepository);
  try {
    return await action(service);
  } catch (e) {
    const handled =
      (await handleStatus?.(statusOf(e), service)) ??
      (await explainRefusal(e, service, detail, verb));
    if (handled === undefined) throw e;
    return handled;
  }
};

const approve = (target: MrActionTarget, { detail }: MrState) =>
  withRefusals(target, detail, 'approve', async service => {
    await service.approveMr(detail, detail.sha);
    await vscode.window.showInformationMessage(`Approved ${ref(detail)}`);
    return true;
  });

const unapprove = (target: MrActionTarget, { detail }: MrState) =>
  withRefusals(
    target,
    detail,
    'revoke your approval of',
    async service => {
      await service.unapproveMr(detail);
      await vscode.window.showInformationMessage(`Revoked your approval of ${ref(detail)}`);
      return true;
    },
    async status => {
      if (status !== 404) return undefined;
      await vscode.window.showInformationMessage(`You had not approved ${ref(detail)}.`);
      return true;
    },
  );

const pickMergeOptions = async (
  detail: RestMrDetail,
): Promise<{ squash: boolean; shouldRemoveSourceBranch: boolean } | undefined> => {
  const items: vscode.QuickPickItem[] = [
    { label: SQUASH_COMMITS, picked: detail.squash },
    { label: DELETE_SOURCE_BRANCH, picked: Boolean(detail.force_remove_source_branch) },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: `Merge ${ref(detail)}`,
    placeHolder: 'Choose merge options, then press Enter',
  });
  if (!picked) return undefined;
  const labels = picked.map(i => i.label);
  return {
    squash: labels.includes(SQUASH_COMMITS),
    shouldRemoveSourceBranch: labels.includes(DELETE_SOURCE_BRANCH),
  };
};

const merge = async (
  target: MrActionTarget,
  { detail }: MrState,
  whenPipelineSucceeds: boolean,
) => {
  const options = await pickMergeOptions(detail);
  if (!options) return false;

  const what = whenPipelineSucceeds ? 'when the pipeline succeeds' : 'now';
  const choices = [
    options.squash ? 'Commits will be squashed.' : undefined,
    options.shouldRemoveSourceBranch ? `${detail.source_branch} will be deleted.` : undefined,
  ].filter(Boolean);
  const label = whenPipelineSucceeds ? 'Merge When Pipeline Succeeds' : 'Merge';
  const confirmed = await confirm(
    `Merge ${ref(detail)} ${what}?`,
    [`${detail.source_branch} → ${detail.target_branch}`, ...choices].join('\n'),
    label,
  );
  if (!confirmed) return false;

  return withRefusals(
    target,
    detail,
    'merge',
    async service => {
      await service.mergeMr(detail, { sha: detail.sha, whenPipelineSucceeds, ...options });
      await vscode.window.showInformationMessage(
        whenPipelineSucceeds
          ? `Merge when pipeline succeeds is set for ${ref(detail)}`
          : `Merged ${ref(detail)} into ${detail.target_branch}`,
      );
      return true;
    },
    async (status, service) => {
      if (status === 405) {
        const fresh = await service.getMrDetail(detail).catch(() => undefined);
        const reason = fresh && mergeBlocker(fresh);
        await vscode.window.showWarningMessage(
          `GitLab will not merge ${ref(detail)} right now${reason ? `: ${reason}.` : '.'}`,
        );
        return true;
      }
      if (status === 406) {
        const choice = await vscode.window.showWarningMessage(
          `${ref(detail)} has conflicts or cannot be merged. Resolve them in GitLab.`,
          OPEN_IN_GITLAB,
        );
        if (choice === OPEN_IN_GITLAB) await openUrl(detail.web_url);
        return true;
      }
      return undefined;
    },
  );
};

const cancelAutoMerge = async (target: MrActionTarget, { detail }: MrState) => {
  const confirmed = await confirm(
    `Cancel merge when pipeline succeeds for ${ref(detail)}?`,
    `${ref(detail)} will stay open until someone merges it.`,
    'Cancel Automatic Merge',
  );
  if (!confirmed) return false;

  return withRefusals(target, detail, 'cancel the automatic merge of', async service => {
    const result = await service.cancelAutoMerge(detail);
    // 13.12 answers 201 even when there was nothing to cancel, with `status: 'error'`
    if (result.status === 'error') {
      await vscode.window.showWarningMessage(
        `${ref(detail)} has no automatic merge to cancel${
          result.message ? ` (GitLab: ${result.message})` : ''
        }.`,
      );
      return true;
    }
    await vscode.window.showInformationMessage(
      `Merge when pipeline succeeds is cancelled for ${ref(detail)}`,
    );
    return true;
  });
};

const setDraft = (target: MrActionTarget, { detail }: MrState, draft: boolean) =>
  withRefusals(target, detail, draft ? 'mark as draft' : 'mark as ready', async service => {
    await service.setMrDraft(detail, draft);
    await vscode.window.showInformationMessage(
      `Marked ${ref(detail)} as ${draft ? 'draft' : 'ready'}`,
    );
    return true;
  });

const close = async (target: MrActionTarget, { detail }: MrState) => {
  const confirmed = await confirm(
    `Close ${ref(detail)}?`,
    `${detail.title}\n\nYou can reopen it later.`,
    'Close Merge Request',
  );
  if (!confirmed) return false;
  return withRefusals(target, detail, 'close', async service => {
    await service.updateMr(detail, { state_event: 'close' });
    await vscode.window.showInformationMessage(`Closed ${ref(detail)}`);
    return true;
  });
};

const reopen = (target: MrActionTarget, { detail }: MrState) =>
  withRefusals(target, detail, 'reopen', async service => {
    await service.updateMr(detail, { state_event: 'reopen' });
    await vscode.window.showInformationMessage(`Reopened ${ref(detail)}`);
    return true;
  });

/**
 * Runs one merge request action against the state the user was shown.
 * Resolves `true` when the merge request may have changed and views should reload.
 */
export const runAction = async (
  id: MrActionId,
  target: MrActionTarget,
  state: MrState,
): Promise<boolean> => {
  switch (id) {
    case 'approve':
      return approve(target, state);
    case 'unapprove':
      return unapprove(target, state);
    case 'merge':
      return merge(target, state, false);
    case 'mergeWhenPipelineSucceeds':
      return merge(target, state, true);
    case 'cancelAutoMerge':
      return cancelAutoMerge(target, state);
    case 'markAsDraft':
      return setDraft(target, state, true);
    case 'markAsReady':
      return setDraft(target, state, false);
    case 'close':
      return close(target, state);
    case 'reopen':
      return reopen(target, state);
    case 'refresh':
      return false;
    default:
      throw new Error(`Unknown merge request action ${id}`);
  }
};
