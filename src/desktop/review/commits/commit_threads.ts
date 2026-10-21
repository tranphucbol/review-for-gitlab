import * as vscode from 'vscode';
import { GqlTextDiffDiscussion } from '../../gitlab/graphql/get_discussions';
import { GitLabService } from '../../gitlab/gitlab_service';
import { getBaseAndHeadUri, HasCommentsFn } from '../../tree_view/items/changed_file_item';
import { findFileInDiffs } from '../../utils/find_file_in_diffs';
import { GitLabCommentThread } from '../gitlab_comment_thread';
import { commentRangeFromPosition, commitFromPosition } from '../gql_position_parser';
import { CommitVersion } from './commit_versions';

const positionOf = (discussion: GqlTextDiffDiscussion) => discussion.notes.nodes[0]?.position;

/**
 * fork-only: a discussion GitLab kept on a commit's SHAs (an outdated note, see
 * docs/plans/014) would sit at a URI no editor of the full diff opens. It shows in the
 * view of that commit instead, unless it is on a version's SHA, where a comparison of
 * versions shows it.
 */
export const isDeferredToCommit = (
  discussion: GqlTextDiffDiscussion,
  mrVersion: RestMrVersion,
  versionShas: string[] = [],
): boolean => {
  const position = positionOf(discussion);
  if (!position) return false;
  const sha = commitFromPosition(position);
  if (sha === mrVersion.base_commit_sha || sha === mrVersion.head_commit_sha) return false;
  if (versionShas.includes(sha)) return false;
  return (mrVersion.commits ?? []).some(c => c.id === sha);
};

const fileFor = (
  discussion: GqlTextDiffDiscussion,
  version: CommitVersion,
): { file: RestDiffFile; isOld: boolean } | undefined => {
  const position = positionOf(discussion);
  if (!position) return undefined;
  const { baseSha, headSha } = position.diffRefs;
  if (headSha !== version.head_commit_sha) return undefined;
  const isOld = position.oldLine !== null;
  if (isOld && baseSha !== version.base_commit_sha) return undefined;
  const file = findFileInDiffs(
    version.diffs,
    isOld ? { oldPath: position.oldPath } : { newPath: position.newPath },
  );
  return file && { file, isOld };
};

/** Creates the threads of one commit when it expands, each once, on the merge request's controller. */
export class CommitThreads {
  readonly #created = new Set<GqlTextDiffDiscussion>();

  readonly #urisWithComments = new Set<string>();

  readonly #commentController: vscode.CommentController;

  readonly #discussions: GqlTextDiffDiscussion[];

  readonly #mr: RestMr;

  readonly #gitlabService: GitLabService;

  readonly #repositoryRoot: string;

  constructor(
    commentController: vscode.CommentController,
    discussions: GqlTextDiffDiscussion[],
    mr: RestMr,
    gitlabService: GitLabService,
    repositoryRoot: string,
  ) {
    this.#commentController = commentController;
    this.#discussions = discussions;
    this.#mr = mr;
    this.#gitlabService = gitlabService;
    this.#repositoryRoot = repositoryRoot;
  }

  addThreadsFor(version: CommitVersion): void {
    this.#discussions.forEach(discussion => {
      if (this.#created.has(discussion)) return;
      const match = fileFor(discussion, version);
      const position = positionOf(discussion);
      if (!match || !position) return;
      const { baseFileUri, headFileUri } = getBaseAndHeadUri(
        this.#mr,
        version,
        match.file,
        this.#repositoryRoot,
      );
      const uri = match.isOld ? baseFileUri : headFileUri;
      const vsThread = this.#commentController.createCommentThread(
        uri,
        commentRangeFromPosition(position),
        [],
      );
      // eslint-disable-next-line no-new
      new GitLabCommentThread(vsThread, discussion, this.#gitlabService, this.#mr);
      this.#created.add(discussion);
      this.#urisWithComments.add(uri.toString());
    });
  }

  hasComments: HasCommentsFn = uri => this.#urisWithComments.has(uri.toString());
}
