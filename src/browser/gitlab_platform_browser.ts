import * as vscode from 'vscode';
import { memoize } from 'lodash';
import {
  GitLabPlatformForAccount,
  GitLabPlatformManager,
} from '../common/platform/gitlab_platform';
import {
  COMMAND_FETCH_FROM_API,
  COMMAND_GET_CONFIG,
  COMMAND_MEDIATOR_TOKEN,
  InteropConfig,
  fetchFromApi,
} from '../common/platform/web_ide';
import { convertToGitLabProject, getProject } from '../common/gitlab/api/get_project';
import { currentUserRequest } from '../common/gitlab/api/get_current_user';
import { TokenAccount } from '../common/platform/gitlab_account';

const getMediatorToken: () => Promise<string> = memoize(async () =>
  vscode.commands.executeCommand(COMMAND_MEDIATOR_TOKEN),
);

const fetchFromApi: fetchFromApi = async request => {
  const token = await getMediatorToken();

  return vscode.commands.executeCommand(COMMAND_FETCH_FROM_API, token, request);
};

const getConfig: () => Promise<InteropConfig> = async () => {
  const token = await getMediatorToken();

  return vscode.commands.executeCommand(COMMAND_GET_CONFIG, token);
};

export const createGitLabPlatformManagerBrowser: () => Promise<GitLabPlatformManager> =
  async () => {
    const config = await getConfig();
    if (!config) {
      throw new Error('Failed to load project config from WebIDE.');
    }
    const { project } = await fetchFromApi(getProject(config.projectPath));
    if (!project) {
      throw new Error(
        `GitLab API returned empty response when asked for ${config.projectPath} project.`,
      );
    }
    const user = await fetchFromApi(currentUserRequest);
    if (!user) {
      throw new Error(`GitLab API returned empty response when asked for the current user.`);
    }

    const gitLabProject = convertToGitLabProject(project);

    const account: TokenAccount = {
      type: 'token',
      username: user.username,
      id: `${user.id}`,
      // Currently we don't have the token available,
      // but that will change once we implement OAuth
      token: '',
      instanceUrl: config.gitlabUrl,
    };

    const accountPlatform: GitLabPlatformForAccount = {
      type: 'account',
      fetchFromApi,
      // browser won't let us change User-Agent header
      // so we don't have to construct it
      getUserAgentHeader: () => ({}),
      account,
      project: undefined,
    };

    return {
      getForActiveProject: () =>
        Promise.resolve({
          ...accountPlatform,
          type: 'project',
          project: gitLabProject,
        }),
      getForActiveAccount: async () => accountPlatform,
      getForAllAccounts: async () => [accountPlatform],
    };
  };
