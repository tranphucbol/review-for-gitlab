import vscode from 'vscode';
import { GitRemote, GitRepository } from '../git/new_git';
import { CustomQueryType } from '../gitlab/custom_query_type';
import { ProjectInRepository } from '../gitlab/new_project';
import { ReviewParams as ReviewUriParams } from '../review/review_uri';
import { makeAccountId, OAuthAccount, TokenAccount } from '../accounts/account';
import { createFakeRepository } from './fake_git_extension';
import { InMemoryMemento } from '../../test/integration/test_infrastructure/in_memory_memento';
import { SecretStorage } from './secret_storage';
import { GqlSecurityFindingReport } from '../gitlab/graphql/get_security_finding_report';
import { GqlProjectWithRepoInfo } from '../gitlab/api/get_projects_with_repository_info';
import { GqlProject, convertToGitLabProject } from '../gitlab/api/get_project';
import { GitLabProject } from '../gitlab/gitlab_project';

export const issue: RestIssuable = {
  id: 1,
  iid: 1000,
  title: 'Issuable Title',
  project_id: 9999,
  web_url: 'https://gitlab.example.com/group/project/issues/1000',
  author: {
    avatar_url:
      'https://secure.gravatar.com/avatar/6042a9152ada74d9fb6a0cdce895337e?s=80&d=identicon',
    name: 'Tomas Vik',
  },
  references: {
    full: 'gitlab-org/gitlab#1000',
  },
  severity: 'severityLevel1',
  name: 'Issuable Name',
};

export const mr: RestMr = {
  ...issue,
  id: 2,
  iid: 2000,
  web_url: 'https://gitlab.example.com/group/project/merge_requests/2000',
  references: {
    full: 'gitlab-org/gitlab!2000',
  },
  sha: '69ad609e8891b8aa3db85a35cd2c5747705bd76a',
  source_project_id: 9999,
  target_project_id: 9999,
  source_branch: 'feature-a',
};

export const diffFile: RestDiffFile = {
  old_path: 'old_file.js',
  new_path: 'new_file.js',
  new_file: false,
  deleted_file: false,
  renamed_file: true,
  diff: '@@ -0,0 +1,7 @@\n+new file 2\n+\n+12\n+34\n+56\n+\n+,,,\n',
};

export const mrVersion: RestMrVersion = {
  id: 3,
  base_commit_sha: 'aaaaaaaa',
  head_commit_sha: 'bbbbbbbb',
  start_commit_sha: 'cccccccc',
  diffs: [diffFile],
};

export const customQuery = {
  name: 'Query name',
  type: CustomQueryType.ISSUE,
  maxResults: 10,
  scope: 'all',
  state: 'closed',
  wip: 'no',
  confidential: false,
  excludeSearchIn: 'all',
  orderBy: 'created_at',
  sort: 'desc',
  searchIn: 'all',
  noItemText: 'No item',
};

export const pipeline: RestPipeline = {
  status: 'success',
  updated_at: '2021-02-12T12:06:17Z',
  id: 123456,
  iid: 1,
  project_id: 567890,
  sha: 'aaaaaaaa',
  ref: 'main',
  web_url: 'https://example.com/foo/bar/pipelines/46',
};

export const job: RestJob = {
  id: 1,
  name: 'Unit tests',
  status: 'success',
  stage: 'test',
  created_at: '2021-07-19T11:44:54.928Z',
  started_at: '2021-07-19T11:44:54.928Z',
  finished_at: '2021-07-19T11:44:54.928Z',
  allow_failure: false,
  web_url: 'https://example.com/foo/bar/jobs/68',
};

export const externalStatus: RestJob = {
  id: 0,
  name: 'external:build',
  status: 'success',
  stage: '',
  created_at: '2022-10-08T11:44:54.928Z',
  started_at: '2022-10-08T11:44:54.928Z',
  finished_at: '2022-10-08T11:44:54.928Z',
  allow_failure: false,
  target_url: 'https://example.com/builds/100',
};

export const artifact: RestArtifact = {
  file_type: 'junit',
  filename: 'junit.xml',
  size: 1024,
};

export const gqlProject: GqlProject = {
  id: 'gid://gitlab/Project/5261717',
  name: 'gitlab-vscode-extension',
  description: '',
  fullPath: 'gitlab-org/gitlab-vscode-extension',
  webUrl: 'https://gitlab.com/gitlab-org/gitlab-vscode-extension',
  group: {
    id: 'gid://gitlab/Group/9970',
  },
};

export const reviewUriParams: ReviewUriParams = {
  mrId: mr.id,
  projectId: mr.project_id,
  repositoryRoot: '/',
  path: 'new_path.js',
  commit: mr.sha,
};

export const project: GitLabProject = convertToGitLabProject(gqlProject);

export const projectWithRepositoryInfo: GqlProjectWithRepoInfo = {
  id: 'gid://gitlab/Project/5261717',
  name: 'gitlab-vscode-extension',
  description: '',
  httpUrlToRepo: 'https://gitlab.com/gitlab-org/gitlab-vscode-extension.git',
  sshUrlToRepo: 'git@gitlab.com:gitlab-org/gitlab-vscode-extension.git',
  fullPath: 'gitlab-org/gitlab-vscode-extension',
  repository: {
    empty: false,
    rootRef: 'main',
  },
};

export const createProject = (namespaceWithPath: string) =>
  convertToGitLabProject({
    ...gqlProject,
    fullPath: namespaceWithPath,
    name: namespaceWithPath.replace('/', '-'),
  });

export const createTokenAccount = (
  instanceUrl = 'https://gitlab.com',
  userId = 1,
  token = 'abc',
): TokenAccount => ({
  id: makeAccountId(instanceUrl, userId),
  username: `user${userId}`,
  instanceUrl,
  token,
  type: 'token',
});

export const createOAuthAccount = (
  instanceUrl = 'https://gitlab.com',
  userId = 1,
  token = 'abc',
): OAuthAccount => ({
  id: makeAccountId(instanceUrl, userId),
  username: `user${userId}`,
  instanceUrl,
  token,
  type: 'oauth',
  scopes: ['read_user', 'api'],
  refreshToken: 'def',
  expiresAtTimestampInSeconds: Math.floor(new Date().getTime() / 1000) + 1000, // valid token
});

export const gitRepository = {
  rootFsPath: '/path/to/repo',
  rawRepository: createFakeRepository(),
} as GitRepository;

export const projectInRepository: ProjectInRepository = {
  project,
  pointer: {
    repository: gitRepository,
    remote: { name: 'name' } as GitRemote,
    urlEntry: { type: 'both', url: 'git@gitlab.com:gitlab-org/gitlab-vscode-extension' },
  },
  account: createTokenAccount(),
};

export const user: RestUser = {
  email: 'test@user.com',
  id: 123,
  state: 'active',
  username: 'test-user',
};

export const createExtensionContext = (): vscode.ExtensionContext =>
  ({
    globalState: new InMemoryMemento(),
    workspaceState: new InMemoryMemento(),
    secrets: new SecretStorage(),
    extensionPath: '',
  } as unknown as vscode.ExtensionContext);

export const securityReport: GqlSecurityFindingReport = {
  baseReportCreatedAt: '2023-04-18T02:10:10.460Z',
  baseReportOutOfDate: '2023-04-18T02:10:10.460Z',
  headReportCreatedAt: '2023-04-18T02:10:10.460Z',
  enabledReports: ['container_scanning'],
  hasSecurityReports: true,
  added: {
    nodes: [
      {
        uuid: '6ae0b693-2b75-5724-92cf-6b35f53a53fd',
        name: 'CVE-2022-22576 in curl-7.79.1-1.amzn2.0.1',
        state: 'detected',
        severity: 'medium',
        scanner: { name: 'Trivy' },
        scan: { type: 'container_scanning' },
        identifiers: {
          nodes: [
            {
              externalId: 'CVE-2022-22576',
              externalType: 'cve',
              name: 'CVE-2022-22576',
              url: 'https://access.redhat.com/security/cve/CVE-2022-22576',
            },
          ],
        },
      },
      {
        uuid: '6ae0b693-2b75-5724-92cf-6b35f53a53fd',
        name: 'CVE-2022-22576 in curl-7.79.1-1.amzn2.0.1',
        state: 'detected',
        severity: 'low',
        scanner: { name: 'Trivy' },
        scan: { type: 'container_scanning' },
        identifiers: {
          nodes: [
            {
              externalId: 'CVE-2022-22576',
              externalType: 'cve',
              name: 'CVE-2022-22576',
              url: 'https://access.redhat.com/security/cve/CVE-2022-22576',
            },
          ],
        },
      },
      {
        uuid: '6ae0b693-2b75-5724-92cf-6b35f53a53fd',
        name: 'CVE-2022-22576 in curl-7.79.1-1.amzn2.0.1',
        state: 'detected',
        severity: 'high',
        scanner: { name: 'Trivy' },
        scan: { type: 'container_scanning' },
        identifiers: {
          nodes: [
            {
              externalId: 'CVE-2022-22576',
              externalType: 'cve',
              name: 'CVE-2022-22576',
              url: 'https://access.redhat.com/security/cve/CVE-2022-22576',
            },
          ],
        },
      },
    ],
  },
  fixed: {
    nodes: [
      {
        uuid: '6ae0b693-2b75-5724-92cf-6b35f53a53fd',
        name: 'CVE-2022-22576 in curl-7.79.1-1.amzn2.0.1',
        state: 'detected',
        severity: 'medium',
        scanner: { name: 'Trivy' },
        scan: { type: 'container_scanning' },
        identifiers: {
          nodes: [
            {
              externalId: 'CVE-2022-22576',
              externalType: 'cve',
              name: 'CVE-2022-22576',
              url: 'https://access.redhat.com/security/cve/CVE-2022-22576',
            },
          ],
        },
      },
      {
        uuid: '6ae0b693-2b75-5724-92cf-6b35f53a53fd',
        name: 'CVE-2022-22576 in curl-7.79.1-1.amzn2.0.1',
        state: 'detected',
        severity: 'low',
        scanner: { name: 'Trivy' },
        scan: { type: 'container_scanning' },
        identifiers: {
          nodes: [
            {
              externalId: 'CVE-2022-22576',
              externalType: 'cve',
              name: 'CVE-2022-22576',
              url: 'https://access.redhat.com/security/cve/CVE-2022-22576',
            },
          ],
        },
      },
      {
        uuid: '6ae0b693-2b75-5724-92cf-6b35f53a53fd',
        name: 'CVE-2022-22576 in curl-7.79.1-1.amzn2.0.1',
        state: 'detected',
        severity: 'high',
        scanner: { name: 'Trivy' },
        scan: { type: 'container_scanning' },
        identifiers: {
          nodes: [
            {
              externalId: 'CVE-2022-22576',
              externalType: 'cve',
              name: 'CVE-2022-22576',
              url: 'https://access.redhat.com/security/cve/CVE-2022-22576',
            },
          ],
        },
      },
    ],
  },
};
