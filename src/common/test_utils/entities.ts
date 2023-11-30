import vscode from 'vscode';
import { InMemoryMemento } from '../../../test/integration/test_infrastructure/in_memory_memento';
import { GqlProject, convertToGitLabProject } from '../gitlab/api/get_project';
import { Account } from '../platform/gitlab_account';
import { GitLabPlatformForAccount, GitLabPlatformForProject } from '../platform/gitlab_platform';
import { GitLabProject } from '../platform/gitlab_project';
import { createFakeFetchFromApi } from './create_fake_fetch_from_api';
import { SecretStorage } from './secret_storage';
import { createFakePartial } from './create_fake_partial';
import { connectToCable } from '../gitlab/api/action_cable';

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

export const project: GitLabProject = convertToGitLabProject(gqlProject);

export const account: Account = {
  username: 'foobar',
  id: 'foobar',
  type: 'token',
  instanceUrl: 'gitlab-instance.xx',
  token: 'foobar-token',
};

export const gitlabPlatformForAccount: GitLabPlatformForAccount = {
  type: 'account',
  account,
  project: undefined,
  fetchFromApi: createFakeFetchFromApi(),
  connectToCable: () => connectToCable(''),
  getUserAgentHeader: () => ({}),
};

export const gitlabPlatformForProject: GitLabPlatformForProject = {
  type: 'project',
  project,
  account,
  fetchFromApi: createFakeFetchFromApi(),
  connectToCable: () => connectToCable(''),
  getUserAgentHeader: () => ({}),
};

export const createExtensionContext = (): vscode.ExtensionContext =>
  createFakePartial<vscode.ExtensionContext>({
    globalState: new InMemoryMemento(),
    workspaceState: new InMemoryMemento(),
    secrets: new SecretStorage(),
    extensionPath: '',
    subscriptions: [],
    extensionUri: vscode.Uri.parse('https://localhost'),
    asAbsolutePath: relativePath => `/test/abs/${relativePath}`,
  });
