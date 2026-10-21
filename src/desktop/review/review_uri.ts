import { Uri } from 'vscode';
import { REVIEW_URI_SCHEME } from '../constants';
import { jsonStringifyWithSortedKeys } from '../utils/json_stringify_with_sorted_keys';

export interface ReviewParams {
  path: string;
  exists: boolean;
  change?: string;
  commit?: string;
  // if the review URI only contains the mandatory params, we treat it as an empty file URI (that's used when showing diff of added/deleted file)
  repositoryRoot: string;
  projectId: number;
  mrId: number;
  // fork-only: `parentSha..sha` when the file belongs to one commit's diff, see docs/plans/014
  scope?: string;
}

export function toReviewUri({
  path,
  exists,
  change,
  commit,
  repositoryRoot,
  projectId,
  mrId,
  scope,
}: ReviewParams): Uri {
  const query = {
    commit,
    change,
    exists: exists ? '1' : '',
    repositoryRoot,
    projectId,
    mrId,
    scope,
  };
  return Uri.file(path).with({
    scheme: REVIEW_URI_SCHEME,
    query: jsonStringifyWithSortedKeys(query),
  });
}

export function fromReviewUri(uri: Uri): ReviewParams {
  const { commit, change, exists, repositoryRoot, projectId, mrId, scope } = JSON.parse(uri.query);
  return {
    path: uri.path,
    exists: !!exists,
    commit,
    change,
    repositoryRoot,
    projectId,
    mrId,
    scope,
  };
}

export function isEmptyFileUri(uri: Uri): boolean {
  const params = fromReviewUri(uri);
  return !params.exists || !params.commit;
}
