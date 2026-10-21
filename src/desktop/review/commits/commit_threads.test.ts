import * as vscode from 'vscode';
import { GqlTextDiffDiscussion } from '../../gitlab/graphql/get_discussions';
import { GitLabService } from '../../gitlab/gitlab_service';
import { mr, mrVersion } from '../../test_utils/entities';
import { getBaseAndHeadUri } from '../../tree_view/items/changed_file_item';
import { CommitThreads, isDeferredToCommit } from './commit_threads';
import { CommitVersion, toCommitVersion } from './commit_versions';

jest.mock('../gitlab_comment_thread');

const file: RestDiffFile = {
  old_path: 'src/a.ts',
  new_path: 'src/a.ts',
  new_file: false,
  deleted_file: false,
  renamed_file: false,
  diff: '@@ -1,2 +1,2 @@\n-a\n+b\n c\n',
};

const commitVersion: CommitVersion = {
  ...toCommitVersion('parent1', 'commit1', [file], mrVersion.id),
  commit: {
    id: 'commit1',
    short_id: 'commit1',
    title: 'commit',
    message: 'commit',
    author_name: 'Jane Doe',
    authored_date: '',
    created_at: '',
    parent_ids: ['parent1'],
  },
};

const versionWithCommits: RestMrVersion = {
  ...mrVersion,
  commits: [
    { ...commitVersion.commit, parent_ids: [] },
    { ...commitVersion.commit, id: 'parent1', parent_ids: [] },
  ],
};

const discussion = (
  baseSha: string,
  headSha: string,
  lines: { oldLine: number | null; newLine: number | null },
): GqlTextDiffDiscussion =>
  ({
    notes: {
      nodes: [
        {
          position: {
            diffRefs: { baseSha, headSha, startSha: baseSha },
            positionType: 'text',
            oldPath: file.old_path,
            newPath: file.new_path,
            ...lines,
          },
        },
      ],
    },
  }) as unknown as GqlTextDiffDiscussion;

const onNewLine = discussion('parent1', 'commit1', { oldLine: null, newLine: 1 });
const onOldLine = discussion('parent1', 'commit1', { oldLine: 1, newLine: null });
const onFullDiff = discussion(mrVersion.base_commit_sha, mrVersion.head_commit_sha, {
  oldLine: null,
  newLine: 1,
});

describe('isDeferredToCommit', () => {
  it.each`
    name                                       | d                                                                                  | deferred
    ${'a note on the merge request version'}   | ${onFullDiff}                                                                      | ${false}
    ${'a note kept on a commit, new side'}     | ${onNewLine}                                                                       | ${true}
    ${'a note kept on a commit, old side'}     | ${onOldLine}                                                                       | ${true}
    ${'a note on an unknown commit'}           | ${discussion('x', 'y', { oldLine: null, newLine: 1 })}                             | ${false}
    ${'an old side on the merge request base'} | ${discussion(mrVersion.base_commit_sha, 'commit1', { oldLine: 1, newLine: null })} | ${false}
  `('$name: $deferred', ({ d, deferred }) => {
    expect(isDeferredToCommit(d, versionWithCommits)).toBe(deferred);
  });

  it("keeps a note on an older version's head, which a comparison of versions shows", () => {
    expect(isDeferredToCommit(onNewLine, versionWithCommits, ['commit1'])).toBe(false);
  });

  it('defers nothing without a commit list', () => {
    expect(isDeferredToCommit(onNewLine, mrVersion)).toBe(false);
  });
});

describe('CommitThreads', () => {
  const createCommentThread = jest.fn().mockReturnValue({});
  const controller = { createCommentThread } as unknown as vscode.CommentController;
  const { baseFileUri, headFileUri } = getBaseAndHeadUri(mr, commitVersion, file, '/repo');

  beforeEach(() => createCommentThread.mockClear());

  it('creates each thread once, at the URI of the commit file', () => {
    const threads = new CommitThreads(
      controller,
      [onNewLine, onOldLine],
      mr,
      {} as GitLabService,
      '/repo',
    );

    threads.addThreadsFor(commitVersion);
    threads.addThreadsFor(commitVersion);

    expect(createCommentThread).toHaveBeenCalledTimes(2);
    expect(createCommentThread.mock.calls[0][0].toString()).toBe(headFileUri.toString());
    expect(createCommentThread.mock.calls[1][0].toString()).toBe(baseFileUri.toString());
    expect(threads.hasComments(headFileUri)).toBe(true);
    expect(threads.hasComments(baseFileUri)).toBe(true);
  });

  it('leaves a thread of another commit alone', () => {
    const threads = new CommitThreads(
      controller,
      [discussion('commit1', 'commit2', { oldLine: null, newLine: 1 })],
      mr,
      {} as GitLabService,
      '/repo',
    );

    threads.addThreadsFor(commitVersion);

    expect(createCommentThread).not.toHaveBeenCalled();
    expect(threads.hasComments(headFileUri)).toBe(false);
  });

  it('scopes the commit URIs so they differ from the merge request URIs', () => {
    const fullDiff = getBaseAndHeadUri(
      mr,
      { ...mrVersion, head_commit_sha: 'commit1' },
      file,
      '/repo',
    );

    expect(headFileUri.toString()).not.toBe(fullDiff.headFileUri.toString());
  });
});
