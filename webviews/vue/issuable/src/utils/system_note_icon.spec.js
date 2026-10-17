import { describe, expect, it } from 'vitest';
import { getSystemNoteIcon, SYSTEM_NOTE_ICONS } from './system_note_icon';
import codicons from '../assets/codicons';

// The old if-chain in SystemNote.created(), keyword by keyword, with the
// asset it picked then and the codicon that stands for it now.
describe('getSystemNoteIcon', () => {
  it.each`
    body                                                       | before               | icon
    ${'added 1 commit'}                                        | ${'commit'}          | ${'git-commit'}
    ${'moved to gitlab-org/other#1'}                           | ${'arrow_right'}     | ${'arrow-right'}
    ${'changed the description'}                               | ${'pencil_square'}   | ${'edit'}
    ${'mentioned in merge request !12'}                        | ${'comment_dots'}    | ${'comment'}
    ${'enabled an automatic merge'}                            | ${'git_merge'}       | ${'git-merge'}
    ${'merged'}                                                | ${'git_merge'}       | ${'git-merge'}
    ${'reopened'}                                              | ${'issue_open'}      | ${'issue-opened'}
    ${'closed'}                                                | ${'issue_close'}     | ${'issue-closed'}
    ${'changed time estimate to 1h'}                           | ${'timer'}           | ${'watch'}
    ${'added 1h of time spent'}                                | ${'timer'}           | ${'watch'}
    ${'assigned to @alice'}                                    | ${'user'}            | ${'person'}
    ${'changed title from a to b'}                             | ${'pencil_square'}   | ${'edit'}
    ${'marked the task Foo as completed'}                      | ${'task_done'}       | ${'tasklist'}
    ${'mentioned in commit abc'}                               | ${'comment_dots'}    | ${'comment'}
    ${'deleted the source branch'}                             | ${'fork'}            | ${'git-branch'}
    ${'made the issue confidential'}                           | ${'eye_slash'}       | ${'eye-closed'}
    ${'made the issue visible to everyone'}                    | ${'eye'}             | ${'eye'}
    ${'changed milestone to %13.12'}                           | ${'clock'}           | ${'milestone'}
    ${'resolved all threads'}                                  | ${'gitLabLogo'}      | ${'circle-small-filled'}
    ${'resolved the discussion'}                               | ${'comment'}         | ${'comment'}
    ${'changed this line in version 2'}                        | ${'gitLabLogo'}      | ${'circle-small-filled'}
    ${'marked this outdated'}                                  | ${'pencil_square'}   | ${'edit'}
    ${'pinned this'}                                           | ${'thumbtack'}       | ${'pinned'}
    ${'marked this issue as a duplicate of #1'}                | ${'issue_duplicate'} | ${'copy'}
    ${'locked this issue'}                                     | ${'lock'}            | ${'lock'}
    ${'unlocked this issue'}                                   | ${'lock_open'}       | ${'unlock'}
    ${'changed due date to May 1'}                             | ${'calendar'}        | ${'calendar'}
    ${'added 2 commits\n\n[Compare with previous version](x)'} | ${'timeline'}        | ${'history'}
    ${'approved this merge request'}                           | ${'git_merge'}       | ${'git-merge'}
    ${'requested review from @bob'}                            | ${'gitLabLogo'}      | ${'circle-small-filled'}
  `('maps "$body" ($before) to $icon', ({ body, icon }) => {
    expect(getSystemNoteIcon(body)).toBe(icon);
  });

  it('falls back for an empty body', () => {
    expect(getSystemNoteIcon()).toBe('circle-small-filled');
  });

  it('uses only glyphs the registry ships', () => {
    SYSTEM_NOTE_ICONS.forEach(([, glyph]) => expect(codicons[glyph]).toBeTruthy());
  });
});
