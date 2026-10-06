import * as vscode from 'vscode';
import assert from 'assert';
import { REVIEW_URI_SCHEME } from '../constants';
import { fromReviewUri } from '../review/review_uri';
import { removeLeadingSlash } from '../utils/remove_leading_slash';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { mrCache } from '../gitlab/mr_cache';
import { ChangedFileItem } from '../tree_view/items/changed_file_item';
import { mrDiffPanelController } from '../review/side_by_side/mr_diff_panel_controller';

const openFromReviewUri = async (uri: vscode.Uri): Promise<void> => {
  const params = fromReviewUri(uri);
  assert(params.path);
  const projectInRepository = gitlabProjectRepository.getProjectOrFail(params.repositoryRoot);
  const cachedMr = mrCache.getMr(params.mrId, projectInRepository);
  assert(cachedMr, 'Extension did not find the merge request, please refresh the side panel.');
  const relativePath = removeLeadingSlash(params.path);
  const file = cachedMr.mrVersion.diffs.find(
    d => d.new_path === relativePath || d.old_path === relativePath,
  );
  assert(file, 'Extension did not find the file in the MR, please refresh the side panel.');
  await mrDiffPanelController.open({
    mr: cachedMr.mr,
    mrVersion: cachedMr.mrVersion,
    file,
    repositoryRoot: params.repositoryRoot,
  });
};

/**
 * Opens a changed file of a merge request in the side-by-side diff webview. Takes the changed
 * file item from the sidebar or, from the diff editor's title bar, the review URI of the file.
 */
export const openMrFileSideBySide = async (param?: ChangedFileItem | vscode.Uri): Promise<void> => {
  if (param instanceof ChangedFileItem) return openFromReviewUri(param.headFileUri);
  const uri = param ?? vscode.window.activeTextEditor?.document.uri;
  assert(
    uri?.scheme === REVIEW_URI_SCHEME,
    'Open a merge request diff first, then open it in the side-by-side view.',
  );
  return openFromReviewUri(uri);
};
