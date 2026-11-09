import {
  discussionOnDiff,
  noteOnDiff,
  singleNote,
  systemNote,
} from '../../../../test/integration/fixtures/graphql/discussions.js';
import { GqlDiscussion, GqlTextDiffDiscussion } from '../../gitlab/graphql/get_discussions';
import { diffFile, mrVersion } from '../../test_utils/entities';
import { toComparisonDiscussions, toDiffDiscussions } from './diff_discussions';

describe('toDiffDiscussions', () => {
  const { oldPath, newPath, diffRefs } = noteOnDiff.position;
  const file: RestDiffFile = { ...diffFile, old_path: oldPath, new_path: newPath };
  const version: RestMrVersion = {
    ...mrVersion,
    base_commit_sha: diffRefs.baseSha,
    head_commit_sha: diffRefs.headSha,
    diffs: [file],
  };

  const textDiscussion = discussionOnDiff as GqlTextDiffDiscussion;
  const withPosition = (position: Record<string, unknown>): GqlDiscussion =>
    ({
      ...textDiscussion,
      notes: {
        nodes: [{ ...noteOnDiff, position: { ...noteOnDiff.position, ...position } }],
      },
    }) as GqlDiscussion;

  it('places a discussion on an old line on the base side', () => {
    const [discussion] = toDiffDiscussions([textDiscussion], version, file);

    expect(discussion).toEqual({
      id: discussionOnDiff.replyId,
      side: 'old',
      line: 48,
      resolvable: discussionOnDiff.resolvable,
      resolved: discussionOnDiff.resolved,
      canResolve: true,
      canReply: true,
      notes: [
        {
          id: noteOnDiff.id,
          authorName: 'Tomas Vik',
          authorUsername: 'viktomas',
          avatarUrl: noteOnDiff.author.avatarUrl,
          createdAt: noteOnDiff.createdAt,
          body: noteOnDiff.body,
          bodyHtml: noteOnDiff.bodyHtml,
          canEdit: true,
          canDelete: true,
          // the fixture predates the `awardEmoji` permission
          canReact: false,
        },
      ],
    });
  });

  it('lets the user react when the note allows it', () => {
    const discussion = {
      ...textDiscussion,
      notes: {
        nodes: [
          {
            ...noteOnDiff,
            userPermissions: { ...noteOnDiff.userPermissions, awardEmoji: true },
          },
        ],
      },
    } as GqlDiscussion;

    const [model] = toDiffDiscussions([discussion], version, file);

    expect(model.notes[0].canReact).toBe(true);
  });

  it('places a discussion on a new line on the head side', () => {
    const discussions = toDiffDiscussions(
      [withPosition({ oldLine: null, newLine: 7 })],
      version,
      file,
    );

    expect(discussions.map(d => [d.side, d.line])).toEqual([['new', 7]]);
  });

  it.each`
    description                        | position
    ${'an old line of another file'}   | ${{ oldPath: 'other.vue' }}
    ${'an old line of another base'}   | ${{ diffRefs: { ...diffRefs, baseSha: 'previous' } }}
    ${'a new line of another file'}    | ${{ oldLine: null, newLine: 7, newPath: 'other.vue' }}
    ${'a new line of another version'} | ${{ oldLine: null, newLine: 7, diffRefs: { ...diffRefs, headSha: 'previous' } }}
  `('skips a discussion on $description', ({ position }) => {
    expect(toDiffDiscussions([withPosition(position)], version, file)).toEqual([]);
  });

  it('skips discussions that are not on a text diff', () => {
    expect(toDiffDiscussions([singleNote, systemNote] as GqlDiscussion[], version, file)).toEqual(
      [],
    );
  });
});

describe('toComparisonDiscussions', () => {
  const { oldPath, newPath, diffRefs } = noteOnDiff.position;
  const file: RestDiffFile = { ...diffFile, old_path: oldPath, new_path: newPath };
  const comparison: RestMrVersion = {
    ...mrVersion,
    base_commit_sha: 'older-head',
    start_commit_sha: 'older-head',
    head_commit_sha: diffRefs.headSha,
    diffs: [file],
  };

  const onNewLine = (position: Record<string, unknown>): GqlDiscussion =>
    ({
      ...discussionOnDiff,
      notes: {
        nodes: [
          {
            ...noteOnDiff,
            position: { ...noteOnDiff.position, oldLine: null, newLine: 7, ...position },
          },
        ],
      },
    }) as GqlDiscussion;

  it('places a discussion on the newer head on the right side', () => {
    const discussions = toComparisonDiscussions([onNewLine({})], comparison, file);

    expect(discussions.map(d => [d.side, d.line])).toEqual([['new', 7]]);
  });

  it('places a discussion on the older head on the left side', () => {
    const discussions = toComparisonDiscussions(
      [onNewLine({ newPath: oldPath, diffRefs: { ...diffRefs, headSha: 'older-head' } })],
      comparison,
      file,
    );

    expect(discussions.map(d => [d.side, d.line])).toEqual([['old', 7]]);
  });

  it.each`
    description                   | position
    ${'an old line'}              | ${{ oldLine: 48, newLine: null }}
    ${'another head'}             | ${{ diffRefs: { ...diffRefs, headSha: 'previous' } }}
    ${'another file on the head'} | ${{ newPath: 'other.vue' }}
  `('skips a discussion on $description', ({ position }) => {
    expect(toComparisonDiscussions([onNewLine(position)], comparison, file)).toEqual([]);
  });
});
