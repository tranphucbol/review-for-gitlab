import { diffFile, mrVersion } from '../test_utils/entities';
import { buildDiffPosition } from './diff_position';

describe('buildDiffPosition', () => {
  const diff: RestDiffFile = {
    ...diffFile,
    diff: '@@ -1,3 +1,4 @@\n a\n-b\n+c\n+d\n e\n',
  };
  const version: RestMrVersion = { ...mrVersion, diffs: [diff] };

  const commonFields = {
    baseSha: 'aaaaaaaa',
    headSha: 'bbbbbbbb',
    startSha: 'cccccccc',
    paths: { oldPath: 'old_file.js', newPath: 'new_file.js' },
  };

  it('positions a comment on the new version by its new line', () => {
    expect(buildDiffPosition(version, diff, 'new', 3)).toEqual({ ...commonFields, newLine: 3 });
  });

  it('positions a comment on an unchanged old line by both line numbers', () => {
    expect(buildDiffPosition(version, diff, 'old', 3)).toEqual({
      ...commonFields,
      oldLine: 3,
      newLine: 4,
    });
  });

  it('positions a comment on a removed old line by its old line', () => {
    expect(buildDiffPosition(version, diff, 'old', 2)).toEqual({
      ...commonFields,
      oldLine: 2,
      newLine: undefined,
    });
  });
});
