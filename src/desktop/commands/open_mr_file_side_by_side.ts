import * as vscode from 'vscode';
import assert from 'assert';
import { REVIEW_URI_SCHEME } from '../constants';
import { fromReviewUri } from '../review/review_uri';
import { removeLeadingSlash } from '../utils/remove_leading_slash';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { mrCache } from '../gitlab/mr_cache';
import { ChangedFileItem } from '../tree_view/items/changed_file_item';
import { mrDiffPanelController } from '../review/side_by_side/mr_diff_panel_controller';
import { mrVersionComparisons, toDiffComparison } from '../review/versions/mr_version_comparison';

/** fork-only: the comparison of two versions the review URIs show, see docs/plans/013 */
const findComparison = (
  mrVersion: RestMrVersion,
  mrId: number,
  headSha?: string,
  baseSha?: string,
) => {
  const isLatest =
    headSha === mrVersion.head_commit_sha &&
    (baseSha === undefined || baseSha === mrVersion.base_commit_sha);
  return isLatest ? undefined : mrVersionComparisons.findLoaded(mrId, headSha, baseSha);
};

/** The base side of the active diff editor, which a title bar command isn't given. */
const activeDiffBaseUri = (): vscode.Uri | undefined => {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (!input) return undefined;
  return input instanceof vscode.TabInputTextDiff && input.original.scheme === REVIEW_URI_SCHEME
    ? input.original
    : undefined;
};

const openFromReviewUri = async (uri: vscode.Uri, baseUri?: vscode.Uri): Promise<void> => {
  const params = fromReviewUri(uri);
  assert(params.path);
  const projectInRepository = gitlabProjectRepository.getProjectOrFail(params.repositoryRoot);
  const cachedMr = mrCache.getMr(params.mrId, projectInRepository);
  assert(cachedMr, 'The merge request is not loaded. Refresh the side panel and try again.');
  const comparison = findComparison(
    cachedMr.mrVersion,
    params.mrId,
    params.commit,
    baseUri && fromReviewUri(baseUri).commit,
  );
  const relativePath = removeLeadingSlash(params.path);
  const file = (comparison?.version ?? cachedMr.mrVersion).diffs.find(
    d => d.new_path === relativePath || d.old_path === relativePath,
  );
  assert(
    file,
    `${relativePath} is not in the merge request. Refresh the side panel and try again.`,
  );
  await mrDiffPanelController.open({
    mr: cachedMr.mr,
    mrVersion: cachedMr.mrVersion,
    file,
    repositoryRoot: params.repositoryRoot,
    comparison: comparison && toDiffComparison(comparison),
  });
};

/**
 * Opens a changed file of a merge request in the side-by-side diff webview. Takes the changed
 * file item from the sidebar or, from the diff editor's title bar, the review URI of the file.
 */
export const openMrFileSideBySide = async (param?: ChangedFileItem | vscode.Uri): Promise<void> => {
  if (param instanceof ChangedFileItem) {
    return openFromReviewUri(param.headFileUri, param.baseFileUri);
  }
  const uri = param ?? vscode.window.activeTextEditor?.document.uri;
  assert(
    uri?.scheme === REVIEW_URI_SCHEME,
    'Open a merge request diff first, then open it in the side-by-side view.',
  );
  return openFromReviewUri(uri, activeDiffBaseUri());
};
