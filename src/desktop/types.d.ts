/**
 * Slimmed-down version of the Issuable, returned for example by
 * https://docs.gitlab.com/ee/api/merge_requests.html#list-issues-that-close-on-merge
 */
interface MinimalRestIssuable {
  id: number;
  iid: number;
  title: string;
  project_id: number;
  author: { name: string; avatar_url: string | null };
}
/**
 * An issuable instance repesents one of these entities:
 *  - Merge Request
 *  - Issue
 *  - Epic
 *  - Snippet
 */
interface RestIssuable extends MinimalRestIssuable {
  web_url: string;
  references: {
    full: string; // e.g. "gitlab-org/gitlab#219925"
  };
  severity: string;
  name: string;
}

interface RestMr extends RestIssuable {
  sha: string;
  source_project_id: number;
  target_project_id: number;
  source_branch: string;
}

interface RestMrUser {
  id: number;
  name: string;
  username: string;
  avatar_url: string | null;
}

interface RestParticipant extends RestMrUser {
  state: string;
}

/**
 * A single merge request, `GET /projects/:id/merge_requests/:iid`. List items
 * lack `user`, `head_pipeline`, `diverged_commits_count` and `merge_error`.
 */
interface RestMrDetail extends RestMr {
  state: 'opened' | 'closed' | 'locked' | 'merged';
  target_branch: string;
  description?: string | null;
  /** GitLab 14.0 and later; 13.12 has only `work_in_progress` */
  draft?: boolean;
  work_in_progress: boolean;
  merge_status: string;
  /** GitLab 15.6 and later */
  detailed_merge_status?: string;
  has_conflicts: boolean;
  blocking_discussions_resolved: boolean;
  merge_when_pipeline_succeeds: boolean;
  should_remove_source_branch: boolean | null;
  force_remove_source_branch: boolean | null;
  squash: boolean;
  reviewers?: RestMrUser[];
  assignees: RestMrUser[];
  labels: string[];
  user?: { can_merge: boolean };
  head_pipeline?: { id: number; status: string; web_url: string } | null;
  diverged_commits_count?: number;
  merge_error?: string | null;
}

/** `GET /projects/:id/merge_requests/:iid/approvals` as GitLab CE 13.12 returns it */
interface RestMrApprovals {
  approved: boolean;
  approved_by: { user: RestMrUser }[];
  user_can_approve: boolean;
  user_has_approved: boolean;
}

interface RestLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

/** Response of https://docs.gitlab.com/ee/api/projects.html#upload-a-file */
interface RestUpload {
  alt: string;
  /** project-relative URL of the upload, e.g. "/uploads/hash/image.png" */
  url: string;
  /** instance-relative URL of the upload, only returned by GitLab 15.10 and later */
  full_path?: string;
  /** markdown that references the upload, e.g. "![image](/uploads/hash/image.png)" */
  markdown: string;
}

interface RestMrVersion {
  id: number;
  head_commit_sha: string;
  base_commit_sha: string;
  start_commit_sha: string;
  diffs: RestDiffFile[];
}

/** An entry of `GET /projects/:id/merge_requests/:iid/versions`, without its diffs */
interface RestMrVersionSummary {
  id: number;
  head_commit_sha: string;
  base_commit_sha: string;
  start_commit_sha: string;
  created_at: string;
  /** `collected`, or `without_files` / `overflow` when the version's diffs are incomplete */
  state: string;
}

interface RestDiffFile {
  new_path: string;
  old_path: string;
  deleted_file: boolean;
  new_file: boolean;
  renamed_file: boolean;
  diff: string;
}

/** Response of `GET /projects/:id/repository/compare`, the fields the extension reads */
interface RestCompare {
  diffs: RestDiffFile[];
  compare_timeout: boolean;
}

interface RestVulnerability {
  location?: {
    file: string;
  };
  web_url: string;
  severity: string;
  name: string;
}

type SnippetVisibility = 'private' | 'public';

interface RestPipeline {
  status:
    | 'running'
    | 'pending'
    | 'success'
    | 'failed'
    | 'canceled'
    | 'skipped'
    | 'waiting_for_resource'
    | 'preparing';
  updated_at: string;
  id: number;
  iid: number;
  ref: string | null;
  sha: string;
  source?: string;
  /**
   * The project_id is only present in GitLab version 13.10 and later.
   * https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/553#note_882220438
   */
  project_id?: number;
  web_url: string;
  name?: string;
}

interface RestArtifact {
  file_type: string;
  size: number;
  filename: string;
  file_format?: string;
}
interface RestJob {
  id: number;
  name: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  erased_at?: string;
  status:
    | 'created'
    | 'pending'
    | 'running'
    | 'failed'
    | 'success'
    | 'canceled'
    | 'skipped'
    | 'manual';
  stage: string;
  artifacts?: RestArtifact[];
  allow_failure: boolean;
  web_url?: string;

  // Used by Commit Status
  target_url?: string;
  description?: string;
}

interface RestBridge extends RestJob {
  downstream_pipeline: RestPipeline;
}

interface RestPendingBridge extends RestJob {
  downstream_pipeline: null;
}

// Incomplete reference of the GitLab user model
interface RestUser {
  id: number;
  username: string;
  email: string;
  state: string;
}

interface RestRepositoryFile {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
}

interface RestRepositoryTreeEntry {
  id: string;
  name: string;
  type: 'tree' | 'blob';
  path: string;
  mode: string;
}

/**
 * GET /projects/:id/repository/branches
 *
 * The following properties exist on the GitLab response but are not used:
 * - merged
 * - protected
 * - default
 * - developers_can_push
 * - developers_can_merge
 * - can_push
 * - web_url
 * - commit
 */
interface RestBranch {
  name: string;
}

/**
 * GET /projects/:id/repository/tags
 *
 * The following properties exist on the GitLab response but are not used:
 * - commit
 * - release
 * - target
 * - message
 * - protected
 */
interface RestTag {
  name: string;
}
