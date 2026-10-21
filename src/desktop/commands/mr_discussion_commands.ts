import assert from 'assert';
import * as vscode from 'vscode';
import { FAILED_COMMENT_CONTEXT } from '../constants';
import { UserFriendlyError } from '../errors/user_friendly_error';
import { READ_ONLY_VERSION_MESSAGE } from '../review/versions/mr_version_comparison';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { mrCache } from '../gitlab/mr_cache';
import { GitLabComment } from '../review/gitlab_comment';
import { buildDiffPosition } from '../review/diff_position';
import { GitLabCommentThread } from '../review/gitlab_comment_thread';
import { fromReviewUri } from '../review/review_uri';
import { findFileInDiffs } from '../utils/find_file_in_diffs';

const getLineNumber = (thread: vscode.CommentThread) => thread.range.start.line + 1;

const createNewComment = async (
  text: string,
  thread: vscode.CommentThread,
): Promise<GitLabCommentThread> => {
  const { path, commit, repositoryRoot, mrId } = fromReviewUri(thread.uri);
  const projectInRepository = gitlabProjectRepository.getProjectOrFail(repositoryRoot);
  const cachedMr = mrCache.getMr(mrId, projectInRepository);
  assert(cachedMr);
  const { mr, mrVersion } = cachedMr;
  const isOld = commit === mrVersion.base_commit_sha;
  // fork-only: a pane of an older version, opened to compare versions, is read-only
  if (!isOld && commit !== mrVersion.head_commit_sha) {
    throw new UserFriendlyError(
      READ_ONLY_VERSION_MESSAGE,
      new Error(`${commit} is not the head of the latest version`),
    );
  }
  const diff = findFileInDiffs(mrVersion.diffs, isOld ? { oldPath: path } : { newPath: path });
  assert(diff);
  if (diff.diff === '')
    throw new Error(
      'Error: Creating comment failed. The merge request diff for this file is too large. ' +
        'Please see https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/578',
    );
  const discussion = await getGitLabService(projectInRepository).createDiffNote(
    mrId,
    text,
    buildDiffPosition(mrVersion, diff, isOld ? 'old' : 'new', getLineNumber(thread)),
  );

  return new GitLabCommentThread(thread, discussion, getGitLabService(projectInRepository), mr);
};

export interface CommentWithThread extends vscode.Comment {
  thread: vscode.CommentThread;
}

const createFailedComment = (body: string, thread: vscode.CommentThread): CommentWithThread => ({
  author: { name: '' }, // we don't want to show author name for failed comment
  body,
  mode: vscode.CommentMode.Editing,
  contextValue: FAILED_COMMENT_CONTEXT,
  thread,
});

const addFailedCommentToThread = (text: string, vsThread: vscode.CommentThread): void => {
  vsThread.comments = [createFailedComment(text, vsThread)]; // eslint-disable-line no-param-reassign
  vsThread.canReply = false; // eslint-disable-line no-param-reassign
};

export const toggleResolved = async (vsThread: vscode.CommentThread): Promise<void> => {
  const firstComment = vsThread.comments[0];
  assert(firstComment instanceof GitLabComment);
  const gitlabThread = firstComment.thread;

  return gitlabThread.toggleResolved();
};

export const deleteComment = async (comment: GitLabComment): Promise<void> => {
  const DELETE_ACTION = 'Delete';
  const shouldDelete = await vscode.window.showWarningMessage(
    'Delete comment?',
    { modal: true },
    DELETE_ACTION,
  );
  if (shouldDelete !== DELETE_ACTION) {
    return undefined;
  }
  return comment.thread.deleteComment(comment);
};

export const editComment = (comment: GitLabComment): void => {
  comment.thread.startEdit(comment);
};

export const cancelEdit = (comment: GitLabComment): void => {
  comment.thread.cancelEdit(comment);
};

export const cancelFailedComment = (comment: CommentWithThread): void => {
  const { thread } = comment;
  thread.dispose();
};

export const submitEdit = async (comment: GitLabComment): Promise<void> =>
  comment.thread.submitEdit(comment);

export const createComment = async ({
  text,
  thread,
}: {
  text: string;
  thread: vscode.CommentThread;
}): Promise<void> => {
  const firstComment = thread.comments[0];
  if (!firstComment || firstComment.contextValue?.match(FAILED_COMMENT_CONTEXT)) {
    try {
      await createNewComment(text, thread);
      return;
    } catch (e) {
      addFailedCommentToThread(text, thread);
      throw e;
    }
  }
  assert(firstComment instanceof GitLabComment);
  const gitlabThread = firstComment.thread;

  await gitlabThread.reply(text);
};

export const retryFailedComment = async (comment: CommentWithThread): Promise<void> => {
  const { thread } = comment;
  const text = comment.body as string;
  return createComment({ text, thread });
};
