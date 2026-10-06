import { getNewLineForOldUnchangedLine } from '../git/diff_line_count';
import { GqlDiffPositionInput } from '../gitlab/graphql/create_diff_comment';

/**
 * Builds the position of a new diff comment on a line of the old (base) or new (head)
 * version of the changed file.
 */
export const buildDiffPosition = (
  mrVersion: RestMrVersion,
  diff: RestDiffFile,
  side: 'old' | 'new',
  line: number,
): GqlDiffPositionInput => {
  const positionFragment =
    side === 'old'
      ? {
          oldLine: line,
          // we let user comment on any line on the old version of the diff
          // this means some of the lines might be unchanged
          // till https://gitlab.com/gitlab-org/gitlab/-/issues/325161 gets fixed, we need to compute
          // the new line index for unchanged line.
          newLine: getNewLineForOldUnchangedLine(mrVersion, diff.old_path, line),
        }
      : { newLine: line };
  return {
    baseSha: mrVersion.base_commit_sha,
    headSha: mrVersion.head_commit_sha,
    startSha: mrVersion.start_commit_sha,
    paths: {
      oldPath: diff.old_path,
      newPath: diff.new_path,
    },
    ...positionFragment,
  };
};
