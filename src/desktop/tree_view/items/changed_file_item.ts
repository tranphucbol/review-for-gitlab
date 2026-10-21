import * as vscode from 'vscode';
import { posix as path } from 'path';
import { isEmptyFileUri, toReviewUri } from '../../review/review_uri';
import { USER_COMMANDS, VS_COMMANDS } from '../../command_names';
import {
  ADDED,
  DELETED,
  RENAMED,
  MODIFIED,
  CHANGE_TYPE_QUERY_KEY,
  HAS_COMMENTS_QUERY_KEY,
} from '../../constants';
import { diffTitleSuffix, getScope } from '../../review/commits/commit_versions';

export type ChangeType = typeof ADDED | typeof DELETED | typeof RENAMED | typeof MODIFIED;
export type HasCommentsFn = (reviewUri: vscode.Uri) => boolean;

export const getChangeType = (file: RestDiffFile): ChangeType => {
  if (file.new_file) return ADDED;
  if (file.deleted_file) return DELETED;
  if (file.renamed_file) return RENAMED;
  return MODIFIED;
};

// fork-only: VS Code shows a comment thread only in an editor whose URI equals the thread's, so
// a thread's URI and every diff URI name a path's change as the latest version does (upstream
// does the same since 763b823d); see docs/plans/013
export const getChangeTypeForPath = (mrVersion: RestMrVersion, filePath: string): ChangeType => {
  const file = mrVersion.diffs.find(d => filePath === d.new_path || filePath === d.old_path);
  return file ? getChangeType(file) : MODIFIED;
};

// All extensions supported by VS Code's built-in Media Previewer.
// https://github.com/microsoft/vscode/blob/ba38f8a5eeb81c05dbdade3e1657e233d770f717/extensions/media-preview/package.json
const mediaExtensions = [
  '.jpg',
  '.jpe',
  '.jpeg',
  '.png',
  '.bmp',
  '.gif',
  '.ico',
  '.webp',
  '.avif',
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.mp4',
  '.webm',
];
const looksLikeMedia = (filePath: string) =>
  mediaExtensions.includes(path.extname(filePath).toLowerCase());

export const getBaseAndHeadUri = (
  mr: RestMr,
  mrVersion: RestMrVersion,
  file: RestDiffFile,
  repositoryPath: string,
  // fork-only: a comparison of two versions passes the latest version, see docs/plans/013
  latestMrVersion?: RestMrVersion,
) => {
  const changeOf = (filePath: string) =>
    latestMrVersion ? getChangeTypeForPath(latestMrVersion, filePath) : getChangeType(file);
  const commonParams = {
    repositoryRoot: repositoryPath,
    projectId: mr.project_id,
    mrId: mr.id,
    scope: getScope(mrVersion),
  };
  const baseFileUri = toReviewUri({
    ...commonParams,
    change: changeOf(file.old_path),
    path: file.old_path,
    exists: !file.new_file,
    commit: mrVersion.base_commit_sha,
  });
  const headFileUri = toReviewUri({
    ...commonParams,
    change: changeOf(file.new_path),
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
    latestMrVersion?: RestMrVersion,
  ) {
    super(vscode.Uri.file(file.new_path));
    if (shownInList) {
      // we don't need the folder information if the item is in tree view
      this.description = path.dirname(`/${file.new_path}`).split('/').slice(1).join('/');
    }
    this.contextValue = 'changed-file-item';
    const uris = getBaseAndHeadUri(mr, mrVersion, file, repositoryPath, latestMrVersion);
    this.headFileUri = uris.headFileUri;
    this.baseFileUri = uris.baseFileUri;
    const headIsEmpty = isEmptyFileUri(uris.headFileUri);
    const baseIsEmpty = isEmptyFileUri(uris.baseFileUri);
    const hasComments = hasComment(this.baseFileUri) || hasComment(this.headFileUri);
    const query = new URLSearchParams([
      [CHANGE_TYPE_QUERY_KEY, getChangeType(file)],
      [HAS_COMMENTS_QUERY_KEY, String(hasComments)],
    ]).toString();
    this.resourceUri = this.resourceUri?.with({ query });

    if (looksLikeMedia(uris.headFileUri.path) && (headIsEmpty || baseIsEmpty)) {
      this.command = {
        title: 'Show changes',
        command: VS_COMMANDS.OPEN,
        arguments: [headIsEmpty ? this.baseFileUri : this.headFileUri],
      };
    } else if (!looksLikeMedia(uris.headFileUri.path)) {
      // fork-only: the side-by-side view replaces the native diff, which stays for media the
      // view cannot show; see docs/decisions/020
      this.command = {
        title: 'Show changes',
        command: USER_COMMANDS.OPEN_MR_FILE_SIDE_BY_SIDE,
        arguments: [this],
      };
    } else {
      this.command = {
        title: 'Show changes',
        command: VS_COMMANDS.DIFF,
        arguments: [
          this.baseFileUri,
          this.headFileUri,
          `${path.basename(file.new_path)} (${diffTitleSuffix(mr, mrVersion)})`,
        ],
      };
    }
  }
}
