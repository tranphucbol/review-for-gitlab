import * as vscode from 'vscode';
import { posix as path } from 'path';
import { handleError } from '../../../common/errors/handle_error';
import { VS_COMMANDS } from '../../command_names';
import { ProjectInRepository } from '../../gitlab/new_project';
import { ChangedFileItem, HasCommentsFn } from '../../tree_view/items/changed_file_item';
import { ChangedFolderItem } from '../../tree_view/items/changed_folder_item';
import { getSidebarViewState, SidebarViewState } from '../../tree_view/sidebar_view_state';
import {
  comparisonLabel,
  isNotFound,
  isRebased,
  MrVersionComparison,
  mrVersionComparisons,
  MrVersionsRef,
  REBASED_MESSAGE,
  VANISHED_MESSAGE,
} from './mr_version_comparison';
import { reviewedVersionStore } from './reviewed_version_store';

/** the context value of the folder; `-picked` adds the inline Clear action */
export const MR_VERSION_COMPARISON_CONTEXT = 'mr-version-comparison';

const NO_FILES = 'No files changed between these versions.';

const COMPARE_TIMEOUT =
  'GitLab stopped comparing these versions before it finished; some files may be missing.';

export const comparisonTitle = (comparison: MrVersionComparison): string =>
  comparison.picked
    ? `Comparing ${comparisonLabel(comparison)}`
    : `Changes Since Your Review (${comparisonLabel(comparison)})`;

const messageItem = (message: string, icon = 'info') => {
  const item = new vscode.TreeItem(message);
  item.iconPath = new vscode.ThemeIcon(icon);
  item.tooltip = message;
  return item;
};

/** Says that the version the reviewer marked as reviewed is no longer in the merge request. */
export const vanishedReviewItem = (): vscode.TreeItem => messageItem(VANISHED_MESSAGE);

/**
 * The files that changed between two versions of a merge request, listed under it next to the
 * files of the whole merge request. The changes load when the folder first opens.
 */
export class MrVersionComparisonItem extends vscode.TreeItem {
  readonly ref: MrVersionsRef;

  readonly comparison: MrVersionComparison;

  readonly #hasComments: HasCommentsFn;

  constructor(ref: MrVersionsRef, comparison: MrVersionComparison, hasComments: HasCommentsFn) {
    super(comparisonTitle(comparison), vscode.TreeItemCollapsibleState.Expanded);
    this.ref = ref;
    this.comparison = comparison;
    this.#hasComments = hasComments;
    this.iconPath = new vscode.ThemeIcon('git-compare');
    this.contextValue = `${MR_VERSION_COMPARISON_CONTEXT}${comparison.picked ? '-picked' : ''}`;
    // a distinct id keeps VS Code from carrying the expanded state of one comparison to another
    this.id = `${ref.projectInRepository.account.id}|${ref.mr.id}|${comparisonLabel(comparison)}`;
    if (isRebased(comparison)) {
      this.description = 'rebased';
      this.tooltip = REBASED_MESSAGE;
    }
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    const { ref, comparison } = this;
    const { mr, projectInRepository } = ref;
    const { version, compareTimeout } = await mrVersionComparisons.load(ref, comparison);
    const repositoryRoot = projectInRepository.pointer.repository.rootFsPath;
    const title = `(!${mr.iid} ${comparisonLabel(comparison)})`;
    const toItem = (diff: RestDiffFile, shownInList: boolean) => {
      const item = new ChangedFileItem(
        mr,
        version,
        diff,
        repositoryRoot,
        this.#hasComments,
        shownInList,
        ref.mrVersion,
      );
      if (item.command?.command === VS_COMMANDS.DIFF) {
        item.command.arguments = [
          item.baseFileUri,
          item.headFileUri,
          `${path.basename(diff.new_path)} ${title}`,
        ];
      }
      return item;
    };
    const files =
      getSidebarViewState() === SidebarViewState.TreeView
        ? new ChangedFolderItem(
            '',
            version.diffs.map(diff => ({
              path: diff.new_path || diff.old_path,
              item: toItem(diff, false),
            })),
          ).getChildren()
        : version.diffs.map(diff => toItem(diff, true));
    const notes = [
      ...(compareTimeout ? [messageItem(COMPARE_TIMEOUT, 'warning')] : []),
      ...(files.length ? [] : [messageItem(NO_FILES)]),
    ];
    return [...notes, ...files];
  }
}

/**
 * The comparison to list under a merge request, if any. If the versions can't be read, the
 * merge request is listed as it is without this feature: a 404 says nothing, any other
 * failure is reported.
 */
export const versionComparisonItems = async (
  ref: MrVersionsRef,
  hasComments: HasCommentsFn,
): Promise<vscode.TreeItem[]> => {
  let comparison: Awaited<ReturnType<typeof mrVersionComparisons.current>>;
  try {
    comparison = await mrVersionComparisons.current(ref);
  } catch (e) {
    if (!isNotFound(e)) handleError(e as Error);
    return [];
  }
  if (comparison === 'vanished') return [vanishedReviewItem()];
  return comparison ? [new MrVersionComparisonItem(ref, comparison, hasComments)] : [];
};

/** The description of a merge request pushed to since the reviewer marked it as reviewed. */
export const reviewStateDescription = (
  projectInRepository: ProjectInRepository,
  mr: RestMr,
): string | undefined => {
  const reviewed = reviewedVersionStore.get(projectInRepository.account, mr);
  return reviewed && reviewed.headSha !== mr.sha ? 'updated since your review' : undefined;
};
