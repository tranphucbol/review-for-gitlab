import * as vscode from 'vscode';
import { diffFile, mr, mrVersion, projectInRepository } from '../test_utils/entities';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { asMock } from '../test_utils/as_mock';
import { CommentingRangeProvider } from './commenting_range_provider';
import { clearCommitVersionsForTests, loadCommitVersion } from './commits/commit_versions';
import { toReviewUri } from './review_uri';

jest.mock('../gitlab/get_gitlab_service');

describe('CommentingRangeProvider', () => {
  let commentingRangeProvider: CommentingRangeProvider;
  const commonUriParams = {
    mrId: mr.id,
    projectId: mr.project_id,
    repositoryRoot: '/',
  };

  const oldFileUrl = toReviewUri({
    ...commonUriParams,
    commit: mrVersion.base_commit_sha,
    path: diffFile.old_path,
    exists: true,
  });

  const newFileUri = toReviewUri({
    ...commonUriParams,
    commit: mrVersion.head_commit_sha,
    path: diffFile.new_path,
    exists: true,
  });

  beforeEach(() => {
    commentingRangeProvider = new CommentingRangeProvider(mr, mrVersion);
  });

  it('returns empty array for different URI schema', () => {
    const testDocument = {
      uri: vscode.Uri.parse('https://example.com'),
    } as vscode.TextDocument;
    expect(commentingRangeProvider.provideCommentingRanges(testDocument)).toEqual([]);
  });

  it('returns full range (all lines in the document) for old file', () => {
    const testDocument = {
      uri: oldFileUrl,
      lineCount: 200,
      lineAt: () => ({
        isEmptyOrWhitespace: false,
      }),
    } as unknown as vscode.TextDocument;
    expect(commentingRangeProvider.provideCommentingRanges(testDocument)).toEqual([
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(199, 0)),
    ]);
  });

  it('returns range without the last line for old file if the last line is empty', () => {
    const testDocument = {
      uri: oldFileUrl,
      lineCount: 200,
      lineAt: () => ({
        isEmptyOrWhitespace: true,
      }),
    } as unknown as vscode.TextDocument;
    expect(commentingRangeProvider.provideCommentingRanges(testDocument)).toEqual([
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(198, 0)),
    ]);
  });

  const threeNewLinesHunk = ['@@ -0,0 +1,3 @@', '+new file 2', '+', '+12', ''].join('\n');

  it('shows correct commenting ranges for a new file', () => {
    commentingRangeProvider = new CommentingRangeProvider(mr, {
      ...mrVersion,
      diffs: [{ ...diffFile, diff: threeNewLinesHunk }],
    });

    const ranges = commentingRangeProvider.provideCommentingRanges({
      uri: newFileUri,
    } as vscode.TextDocument);

    // VS Code indexes lines starting with zero
    expect(ranges.map(r => r.start.line)).toEqual([0, 1, 2]);
  });

  it('returns no ranges for the head of an older version, opened to compare versions', () => {
    commentingRangeProvider = new CommentingRangeProvider(mr, {
      ...mrVersion,
      diffs: [{ ...diffFile, diff: threeNewLinesHunk }],
    });
    const olderHeadUri = toReviewUri({
      ...commonUriParams,
      commit: 'older-head',
      path: diffFile.new_path,
      exists: true,
    });

    const ranges = commentingRangeProvider.provideCommentingRanges({
      uri: olderHeadUri,
    } as vscode.TextDocument);

    expect(ranges).toEqual([]);
  });

  describe('a file of one commit', () => {
    const oneAddedLine = ['@@ -1,1 +1,2 @@', ' a', '+b', ''].join('\n');
    const commitFile = { ...diffFile, diff: oneAddedLine };

    beforeEach(async () => {
      clearCommitVersionsForTests();
      asMock(getGitLabService).mockReturnValue({
        getCommit: async () => ({ parent_ids: ['parent1'] }),
        getCommitDiff: async () => [commitFile],
      });
      await loadCommitVersion(mr, mrVersion, projectInRepository, mrVersion.head_commit_sha);
    });

    const scopedUri = (commit: string) =>
      toReviewUri({
        ...commonUriParams,
        commit,
        path: commitFile.new_path,
        exists: true,
        scope: `parent1..${mrVersion.head_commit_sha}`,
      });

    it("takes the commit's added lines, not the merge request's", () => {
      const ranges = commentingRangeProvider.provideCommentingRanges({
        uri: scopedUri(mrVersion.head_commit_sha),
      } as vscode.TextDocument);

      expect(ranges.map(r => r.start.line)).toEqual([1]);
    });

    it('takes the whole parent side', () => {
      const ranges = commentingRangeProvider.provideCommentingRanges({
        uri: scopedUri('parent1'),
        lineCount: 10,
        lineAt: () => ({ isEmptyOrWhitespace: false }),
      } as unknown as vscode.TextDocument);

      expect(ranges).toEqual([
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(9, 0)),
      ]);
    });

    it('offers nothing for a commit that is not loaded', () => {
      const uri = toReviewUri({
        ...commonUriParams,
        commit: 'other',
        path: commitFile.new_path,
        exists: true,
        scope: 'parent1..other',
      });

      expect(
        commentingRangeProvider.provideCommentingRanges({ uri } as vscode.TextDocument),
      ).toEqual([]);
    });
  });
});
