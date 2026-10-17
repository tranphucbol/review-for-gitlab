import { JiraLinkConfig, findJiraKeysFor } from '../../jira/jira_keys';

export type MrActionId =
  | 'approve'
  | 'unapprove'
  | 'merge'
  | 'mergeWhenPipelineSucceeds'
  | 'cancelAutoMerge'
  | 'markAsDraft'
  | 'markAsReady'
  | 'close'
  | 'reopen'
  | 'editReviewers'
  | 'editAssignees'
  | 'editLabels'
  | 'refresh'
  | 'openJiraIssue';

export interface MrAction {
  id: MrActionId;
  label: string;
  icon: string;
  /** set when the action is listed but can't run; the reason says why */
  unavailableReason?: string;
  /** the issue `openJiraIssue` opens */
  jiraKey?: string;
}

const MAX_JIRA_ACTIONS = 5;

/** One `Open PC-12 in Jira` action per key in the source branch, title and description. */
export const jiraActions = (
  detail: RestMrDetail,
  config: JiraLinkConfig | undefined,
): MrAction[] =>
  config
    ? findJiraKeysFor(config, { mr: detail })
        .slice(0, MAX_JIRA_ACTIONS)
        .map(({ key }) => ({
          id: 'openJiraIssue',
          label: `Open ${key} in Jira`,
          icon: 'link-external',
          jiraKey: key,
        }))
    : [];

export const STILL_CHECKING_REASON =
  'GitLab is still checking whether this can be merged — try again in a moment';

const RUNNING_PIPELINE_STATUSES = ['created', 'pending', 'running'];
const CHECKING_MERGE_STATUSES = ['unchecked', 'checking', 'cannot_be_merged_recheck'];

export const isDraft = (detail: RestMrDetail): boolean => detail.draft ?? detail.work_in_progress;

const isStillChecking = (detail: RestMrDetail) =>
  CHECKING_MERGE_STATUSES.includes(detail.merge_status);

/** The first reason GitLab would refuse to merge, or undefined when it would merge. */
export const mergeBlocker = (detail: RestMrDetail): string | undefined => {
  if (detail.state !== 'opened') return `It is ${detail.state}`;
  if (!detail.user?.can_merge) return 'You are not allowed to merge it';
  if (isDraft(detail)) return 'It is a draft — mark it as ready first';
  if (detail.has_conflicts) return 'It has conflicts — resolve them in GitLab';
  if (!detail.blocking_discussions_resolved) return 'Unresolved threads must be resolved';
  if (isStillChecking(detail)) return STILL_CHECKING_REASON;
  if (detail.merge_status !== 'can_be_merged') return 'GitLab reports it cannot be merged';
  return undefined;
};

const hasRunningPipeline = (detail: RestMrDetail) =>
  Boolean(detail.head_pipeline && RUNNING_PIPELINE_STATUSES.includes(detail.head_pipeline.status));

/**
 * Lists the actions for a merge request in the order the quick pick shows them.
 * Actions that can't run but that the user may look for carry an `unavailableReason`.
 * Encodes GitLab 13.12 semantics; see docs/plans/004_merge-request-actions.md.
 */
export const availableActions = (detail: RestMrDetail, approvals: RestMrApprovals): MrAction[] => {
  const opened = detail.state === 'opened';
  const actions: MrAction[] = [];

  if (approvals.user_has_approved) {
    actions.push({ id: 'unapprove', label: 'Revoke approval', icon: 'circle-slash' });
  } else if (opened) {
    actions.push({
      id: 'approve',
      label: 'Approve',
      icon: 'check',
      unavailableReason: approvals.user_can_approve
        ? undefined
        : 'You are not allowed to approve it',
    });
  }

  if (opened) {
    const blocker = mergeBlocker(detail);
    actions.push({ id: 'merge', label: 'Merge…', icon: 'git-merge', unavailableReason: blocker });
    if (!blocker && hasRunningPipeline(detail) && !detail.merge_when_pipeline_succeeds) {
      actions.push({
        id: 'mergeWhenPipelineSucceeds',
        label: 'Merge when pipeline succeeds…',
        icon: 'watch',
      });
    }
    if (isStillChecking(detail)) {
      actions.push({ id: 'refresh', label: 'Refresh', icon: 'refresh' });
    }
  }

  if (detail.merge_when_pipeline_succeeds) {
    actions.push({
      id: 'cancelAutoMerge',
      label: 'Cancel merge when pipeline succeeds',
      icon: 'circle-slash',
    });
  }

  if (opened) {
    actions.push(
      isDraft(detail)
        ? { id: 'markAsReady', label: 'Mark as ready', icon: 'edit' }
        : { id: 'markAsDraft', label: 'Mark as draft', icon: 'edit' },
    );
    // without the current reviewers the new list would silently drop them
    if (detail.reviewers) {
      actions.push({ id: 'editReviewers', label: 'Edit reviewers…', icon: 'person' });
    }
    actions.push({ id: 'editAssignees', label: 'Edit assignees…', icon: 'account' });
    actions.push({ id: 'editLabels', label: 'Edit labels…', icon: 'tag' });
    actions.push({ id: 'close', label: 'Close merge request', icon: 'close' });
  }
  if (detail.state === 'closed') {
    actions.push({ id: 'reopen', label: 'Reopen merge request', icon: 'issue-reopened' });
  }

  return actions;
};

const MERGE_STATUS_TEXT: Record<string, string> = {
  can_be_merged: 'can be merged',
  cannot_be_merged: 'cannot be merged',
};

const PIPELINE_STATUS_TEXT: Record<string, string> = {
  success: 'passed',
  failed: 'failed',
  canceled: 'canceled',
  skipped: 'skipped',
  manual: 'waiting for a manual action',
};

/** e.g. `!42 Add retries — opened · can be merged · pipeline passed · approved by 1` */
export const describeMr = (detail: RestMrDetail, approvals: RestMrApprovals): string => {
  const facts: string[] = [detail.state];
  if (detail.state === 'opened') {
    if (isDraft(detail)) facts.push('draft');
    facts.push(
      MERGE_STATUS_TEXT[detail.merge_status] ??
        (isStillChecking(detail) ? 'checking mergeability' : detail.merge_status),
    );
    if (detail.merge_when_pipeline_succeeds) facts.push('merges when pipeline succeeds');
  }
  if (detail.head_pipeline) {
    const { status } = detail.head_pipeline;
    facts.push(`pipeline ${PIPELINE_STATUS_TEXT[status] ?? status}`);
  }
  const approvers = approvals.approved_by.length;
  facts.push(approvers ? `approved by ${approvers}` : 'not approved');
  return `!${detail.iid} ${detail.title} — ${facts.join(' · ')}`;
};
