import * as vscode from 'vscode';
import { posix as path } from 'path';
import { toReviewUri } from '../../review/review_uri';
import { VS_COMMANDS } from '../../command_names';
import {
  ADDED,
  DELETED,
  RENAMED,
  MODIFIED,
  CHANGE_TYPE_QUERY_KEY,
  HAS_COMMENTS_QUERY_KEY,
} from '../../constants';

export type ChangeType = typeof ADDED | typeof DELETED | typeof RENAMED | typeof MODIFIED;
export type HasCommentsFn = (reviewUri: vscode.Uri) => boolean;

const getChangeType = (file: RestDiffFile): ChangeType => {
  if (file.new_file) return ADDED;
  if (file.deleted_file) return DELETED;
  if (file.renamed_file) return RENAMED;
  return MODIFIED;
};

const getBaseAndHeadUri = (
  mr: RestMr,
  mrVersion: RestMrVersion,
  file: RestDiffFile,
  repositoryPath: string,
) => {
  const commonParams = {
    repositoryRoot: repositoryPath,
    projectId: mr.project_id,
    mrId: mr.id,
  };
  const baseFileUri = toReviewUri({
    ...commonParams,
    path: file.old_path,
    exists: !file.new_file,
    commit: mrVersion.base_commit_sha,
  });
  const headFileUri = toReviewUri({
    ...commonParams,
    path: file.new_path,
    exists: !file.deleted_file,
    commit: mrVersion.head_commit_sha,
  });
  return { baseFileUri, headFileUri };
};

export class ChangedFileItem extends vscode.TreeItem {
  headFileUri: vscode.Uri;

  baseFileUri: vscode.Uri;

  constructor(
    mr: RestMr,
    mrVersion: RestMrVersion,
    file: RestDiffFile,
    repositoryPath: string,
    hasComment: HasCommentsFn,
    shownInList = true,
  ) {
    super(vscode.Uri.file(file.new_path));
    if (shownInList) {
      // we don't need the folder information if the item is in tree view
      this.description = path.dirname(`/${file.new_path}`).split('/').slice(1).join('/');
    }
    this.contextValue = 'changed-file-item';
    const uris = getBaseAndHeadUri(mr, mrVersion, file, repositoryPath);
    this.headFileUri = uris.headFileUri;
    this.baseFileUri = uris.baseFileUri;
    const hasComments = hasComment(this.baseFileUri) || hasComment(this.headFileUri);
    const query = new URLSearchParams([
      [CHANGE_TYPE_QUERY_KEY, getChangeType(file)],
      [HAS_COMMENTS_QUERY_KEY, String(hasComments)],
    ]).toString();
    this.resourceUri = this.resourceUri?.with({ query });
    this.command = {
      title: 'Show changes',
      command: VS_COMMANDS.DIFF,
      arguments: [
        this.baseFileUri,
        this.headFileUri,
        `${path.basename(file.new_path)} (!${mr.iid})`,
      ],
    };
  }
}
