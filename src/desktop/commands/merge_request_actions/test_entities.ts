import { mr } from '../../test_utils/entities';

export const createMrDetail = (overrides: Partial<RestMrDetail> = {}): RestMrDetail => ({
  ...mr,
  iid: 42,
  title: 'Add retries',
  state: 'opened',
  target_branch: 'main',
  work_in_progress: false,
  merge_status: 'can_be_merged',
  has_conflicts: false,
  blocking_discussions_resolved: true,
  merge_when_pipeline_succeeds: false,
  should_remove_source_branch: null,
  force_remove_source_branch: true,
  squash: false,
  assignees: [],
  reviewers: [],
  labels: [],
  user: { can_merge: true },
  head_pipeline: { id: 1, status: 'success', web_url: 'https://example/pipelines/1' },
  ...overrides,
});

export const createApprovals = (overrides: Partial<RestMrApprovals> = {}): RestMrApprovals => ({
  approved: false,
  approved_by: [],
  user_can_approve: true,
  user_has_approved: false,
  ...overrides,
});
