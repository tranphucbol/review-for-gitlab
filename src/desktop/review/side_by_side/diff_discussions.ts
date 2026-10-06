import { GqlTextDiffNote } from '../../gitlab/graphql/shared';
import { GqlDiscussion, GqlTextDiffDiscussion } from '../../gitlab/graphql/get_discussions';
import { DiffDiscussionModel, DiffNoteModel } from './messages';

const isTextDiffDiscussion = (discussion: GqlDiscussion): discussion is GqlTextDiffDiscussion =>
  discussion.notes.nodes[0]?.position?.positionType === 'text';

const toNoteModel = (note: GqlTextDiffNote): DiffNoteModel => ({
  id: note.id,
  authorName: note.author.name,
  authorUsername: note.author.username,
  avatarUrl: note.author.avatarUrl ?? '',
  createdAt: note.createdAt,
  body: note.body,
  bodyHtml: note.bodyHtml,
  canEdit: note.userPermissions.adminNote,
  canDelete: note.userPermissions.adminNote,
});

/**
 * Picks the discussions that the native diff shows on this file and places each on the
 * line of the base or head version it was started on. A discussion on a line of the old
 * version belongs to the base commit, any other to the head commit, so a discussion
 * started on an earlier version of the merge request isn't shown.
 */
export const toDiffDiscussions = (
  discussions: GqlDiscussion[],
  mrVersion: RestMrVersion,
  file: RestDiffFile,
): DiffDiscussionModel[] =>
  discussions.filter(isTextDiffDiscussion).flatMap(discussion => {
    const [firstNote] = discussion.notes.nodes;
    const { position } = firstNote;
    const isOld = position.oldLine !== null;
    const matches = isOld
      ? position.oldPath === file.old_path &&
        position.diffRefs.baseSha === mrVersion.base_commit_sha
      : position.newPath === file.new_path &&
        position.diffRefs.headSha === mrVersion.head_commit_sha;
    if (!matches) return [];
    return [
      {
        id: discussion.replyId,
        side: isOld ? 'old' : 'new',
        line: (isOld ? position.oldLine : position.newLine) as number,
        resolvable: discussion.resolvable,
        resolved: discussion.resolved,
        canResolve: firstNote.userPermissions.resolveNote,
        canReply: firstNote.userPermissions.createNote,
        notes: discussion.notes.nodes.filter(note => !note.system).map(toNoteModel),
      },
    ];
  });
