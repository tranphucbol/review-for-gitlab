import {
  availableActions,
  describeMr,
  isDraft,
  mergeBlocker,
  MrActionId,
  STILL_CHECKING_REASON,
} from './available_actions';
import { createApprovals, createMrDetail } from './test_entities';

const ids = (detail: RestMrDetail, approvals = createApprovals()) =>
  availableActions(detail, approvals)
    .filter(a => !a.unavailableReason)
    .map(a => a.id);

const unavailable = (detail: RestMrDetail, approvals = createApprovals()) =>
  Object.fromEntries(
    availableActions(detail, approvals)
      .filter(a => a.unavailableReason)
      .map(a => [a.id, a.unavailableReason]),
  ) as Partial<Record<MrActionId, string>>;

describe('availableActions', () => {
  it('offers approve, merge, draft and close on a mergeable open merge request', () => {
    expect(ids(createMrDetail())).toEqual(['approve', 'merge', 'markAsDraft', 'close']);
  });

  describe('approve', () => {
    it('offers revoke instead once the user has approved', () => {
      const actions = ids(createMrDetail(), createApprovals({ user_has_approved: true }));

      expect(actions).toContain('unapprove');
      expect(actions).not.toContain('approve');
    });

    it('lists approve as unavailable when the user cannot approve', () => {
      expect(unavailable(createMrDetail(), createApprovals({ user_can_approve: false }))).toEqual({
        approve: 'You are not allowed to approve it',
      });
    });

    it('offers revoke on a merged merge request the user approved', () => {
      expect(
        ids(createMrDetail({ state: 'merged' }), createApprovals({ user_has_approved: true })),
      ).toEqual(['unapprove']);
    });
  });

  describe('merge', () => {
    it.each`
      case                    | overrides                                                    | reason
      ${'user cannot merge'}  | ${{ user: { can_merge: false } }}                            | ${'You are not allowed to merge it'}
      ${'user field missing'} | ${{ user: undefined }}                                       | ${'You are not allowed to merge it'}
      ${'draft (13.12)'}      | ${{ work_in_progress: true }}                                | ${'It is a draft — mark it as ready first'}
      ${'draft (14.0+)'}      | ${{ draft: true, work_in_progress: false }}                  | ${'It is a draft — mark it as ready first'}
      ${'conflicts'}          | ${{ has_conflicts: true, merge_status: 'cannot_be_merged' }} | ${'It has conflicts — resolve them in GitLab'}
      ${'unresolved threads'} | ${{ blocking_discussions_resolved: false }}                  | ${'Unresolved threads must be resolved'}
      ${'unchecked'}          | ${{ merge_status: 'unchecked' }}                             | ${STILL_CHECKING_REASON}
      ${'checking'}           | ${{ merge_status: 'checking' }}                              | ${STILL_CHECKING_REASON}
      ${'cannot be merged'}   | ${{ merge_status: 'cannot_be_merged' }}                      | ${'GitLab reports it cannot be merged'}
    `('is unavailable when $case', ({ overrides, reason }) => {
      expect(unavailable(createMrDetail(overrides)).merge).toBe(reason);
    });

    it('offers refresh while GitLab is still checking', () => {
      expect(ids(createMrDetail({ merge_status: 'checking' }))).toContain('refresh');
      expect(ids(createMrDetail())).not.toContain('refresh');
    });

    it('reads draft from `draft` before `work_in_progress`', () => {
      expect(isDraft(createMrDetail({ draft: false, work_in_progress: true }))).toBe(false);
      expect(isDraft(createMrDetail({ work_in_progress: true }))).toBe(true);
    });

    it('has no blocker on a mergeable merge request', () => {
      expect(mergeBlocker(createMrDetail())).toBeUndefined();
    });
  });

  describe('merge when pipeline succeeds', () => {
    it.each(['created', 'pending', 'running'])('is offered while the pipeline is %s', status => {
      const detail = createMrDetail({ head_pipeline: { id: 1, status, web_url: '' } });

      expect(ids(detail)).toContain('mergeWhenPipelineSucceeds');
    });

    it.each(['success', 'failed', 'skipped'])('is not offered when the pipeline is %s', status => {
      const detail = createMrDetail({ head_pipeline: { id: 1, status, web_url: '' } });

      expect(availableActions(detail, createApprovals()).map(a => a.id)).not.toContain(
        'mergeWhenPipelineSucceeds',
      );
    });

    it('is not offered without a pipeline', () => {
      expect(ids(createMrDetail({ head_pipeline: null }))).not.toContain(
        'mergeWhenPipelineSucceeds',
      );
    });

    it('is not offered when merge is blocked', () => {
      const detail = createMrDetail({
        work_in_progress: true,
        head_pipeline: { id: 1, status: 'running', web_url: '' },
      });

      expect(availableActions(detail, createApprovals()).map(a => a.id)).not.toContain(
        'mergeWhenPipelineSucceeds',
      );
    });

    it('is replaced by cancel once it is set', () => {
      const detail = createMrDetail({
        merge_when_pipeline_succeeds: true,
        head_pipeline: { id: 1, status: 'running', web_url: '' },
      });

      expect(ids(detail)).toContain('cancelAutoMerge');
      expect(ids(detail)).not.toContain('mergeWhenPipelineSucceeds');
    });
  });

  it('offers mark as ready on a draft', () => {
    const actions = ids(createMrDetail({ work_in_progress: true }));

    expect(actions).toContain('markAsReady');
    expect(actions).not.toContain('markAsDraft');
  });

  it('offers only reopen on a closed merge request', () => {
    const detail = createMrDetail({ state: 'closed' });

    expect(ids(detail)).toEqual(['reopen']);
    expect(unavailable(detail)).toEqual({});
  });

  it.each(['merged', 'locked'] as const)('offers nothing on a %s merge request', state => {
    expect(availableActions(createMrDetail({ state }), createApprovals())).toEqual([]);
  });
});

describe('describeMr', () => {
  it('summarizes an open merge request', () => {
    const approvals = createApprovals({
      approved_by: [{ user: { id: 1, name: 'A', username: 'a', avatar_url: null } }],
    });

    expect(describeMr(createMrDetail(), approvals)).toBe(
      '!42 Add retries — opened · can be merged · pipeline passed · approved by 1',
    );
  });

  it('mentions draft, checking and auto-merge', () => {
    const detail = createMrDetail({
      work_in_progress: true,
      merge_status: 'checking',
      merge_when_pipeline_succeeds: true,
      head_pipeline: { id: 1, status: 'running', web_url: '' },
    });

    expect(describeMr(detail, createApprovals())).toBe(
      '!42 Add retries — opened · draft · checking mergeability · merges when pipeline succeeds · pipeline running · not approved',
    );
  });

  it('leaves out merge status on a merged merge request', () => {
    expect(
      describeMr(createMrDetail({ state: 'merged', head_pipeline: null }), createApprovals()),
    ).toBe('!42 Add retries — merged · not approved');
  });
});
