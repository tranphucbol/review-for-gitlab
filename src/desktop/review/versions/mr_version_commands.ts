import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { resolveTarget } from '../../commands/merge_request_actions/merge_request_actions';
import { currentBranchRefresher } from '../../current_branch_refresher';
import { mrCache } from '../../gitlab/mr_cache';
import { issuableDataProvider } from '../../tree_view/issuable_data_provider';
import {
  BASE_LABEL,
  MrVersionChoice,
  mrVersionComparisons,
  MrVersionsRef,
} from './mr_version_comparison';
import { MrVersionComparisonItem } from './mr_version_comparison_item';
import { reviewedVersionStore } from './reviewed_version_store';

dayjs.extend(relativeTime);

interface VersionItem extends vscode.QuickPickItem {
  /** `undefined` for the target branch */
  choice?: MrVersionChoice;
}

const shortSha = (sha: string) => sha.slice(0, 8);

/** The merge request of the sidebar item, review diff or side-by-side view, as last loaded. */
const resolveVersionsRef = async (arg: unknown): Promise<MrVersionsRef | undefined> => {
  const target = await resolveTarget(arg);
  if (!target) return undefined;
  const { mr, projectInRepository } = target;
  const cached = mrCache.getMr(mr.id, projectInRepository);
  const { mrVersion } = cached ?? (await mrCache.reloadMr(mr, projectInRepository));
  return { mr: cached?.mr ?? mr, projectInRepository, mrVersion };
};

const refreshViews = async () => {
  issuableDataProvider.refresh();
  // the merge request of the current branch has its own tree
  await currentBranchRefresher.refresh();
};

/**
 * `gl.markMrAsReviewed`: remembers the version of the merge request the reviewer has loaded,
 * so the sidebar can list what changes after it. Nothing is sent to GitLab.
 */
export const markMrAsReviewed = async (arg?: unknown): Promise<void> => {
  const ref = await resolveVersionsRef(arg);
  if (!ref) return;
  const { mr, projectInRepository, mrVersion } = ref;
  await reviewedVersionStore.record(projectInRepository.account, mr, mrVersion.head_commit_sha);
  mrVersionComparisons.clear(ref);
  await refreshViews();
  vscode.window.setStatusBarMessage(
    `Marked !${mr.iid} as reviewed at ${shortSha(mrVersion.head_commit_sha)}.`,
    5000,
  );
};

const toItem = (choice: MrVersionChoice, reviewedHead?: string): VersionItem => {
  const tags = [
    ...(choice.isLatest ? ['latest'] : []),
    ...(choice.headSha === reviewedHead ? ['your review'] : []),
  ];
  return {
    label: choice.label,
    description: [shortSha(choice.headSha), dayjs(choice.createdAt).fromNow(), ...tags].join(' · '),
    choice,
  };
};

const baseItem: VersionItem = {
  label: BASE_LABEL,
  description: 'the target branch, as the latest version compares with it',
};

const pick = async (
  items: VersionItem[],
  placeHolder: string,
  title: string,
): Promise<VersionItem | undefined> =>
  vscode.window.showQuickPick(items, {
    title,
    placeHolder,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });

/**
 * `gl.compareMrVersions`: lists the changes between two versions of a merge request under it in
 * the sidebar, as GitLab's "Compare with" does.
 */
export const compareMrVersions = async (arg?: unknown): Promise<void> => {
  const ref = await resolveVersionsRef(arg);
  if (!ref) return;
  const { mr, projectInRepository } = ref;
  const choices = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Loading the versions of !${mr.iid}` },
    () => mrVersionComparisons.versions(ref),
  );
  if (choices.length < 2) {
    await vscode.window.showInformationMessage(`!${mr.iid} has only one version.`);
    return;
  }
  const reviewedHead = reviewedVersionStore.get(projectInRepository.account, mr)?.headSha;
  const title = `Compare versions of !${mr.iid}`;
  const older = await pick(
    [...choices.slice(1).map(c => toItem(c, reviewedHead)), baseItem],
    'Select the older version',
    title,
  );
  if (!older) return;
  const olderIndex = older.choice ? choices.indexOf(older.choice) : choices.length;
  const newer = await pick(
    choices.slice(0, olderIndex).map(c => toItem(c, reviewedHead)),
    'Select the newer version',
    title,
  );
  if (!newer?.choice) return;
  if (!older.choice && newer.choice.isLatest) {
    // the whole merge request is listed already
    mrVersionComparisons.clear(ref);
  } else {
    mrVersionComparisons.pick(ref, {
      fromHead: older.choice?.headSha,
      toHead: newer.choice.headSha,
    });
  }
  await refreshViews();
  await vscode.commands.executeCommand('workbench.view.extension.gitlab-workflow');
};

/** `gl.clearMrVersionComparison`: goes back to the changes since the reviewer's last review. */
export const clearMrVersionComparison = async (item?: MrVersionComparisonItem): Promise<void> => {
  const ref = item?.ref ?? (await resolveVersionsRef(undefined));
  if (!ref) return;
  mrVersionComparisons.clear(ref);
  await refreshViews();
};
