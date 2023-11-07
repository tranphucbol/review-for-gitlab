import * as vscode from 'vscode';
import { memoize } from 'lodash';
import { GitLabPlatformBase, GitLabPlatformManager } from '../common/platform/gitlab_platform';
import {
  COMMAND_FETCH_FROM_API,
  COMMAND_GET_CONFIG,
  COMMAND_MEDIATOR_TOKEN,
  InteropConfig,
  fetchFromApi,
} from '../common/platform/web_ide';
import { convertToGitLabProject, getProject } from '../common/gitlab/api/get_project';
import { GitLabTelemetryEnvironmentBrowser } from './gitlab_telemetry_environment_browser';

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

    const gitLabProject = convertToGitLabProject(project);
    const telemetryEnvironment = new GitLabTelemetryEnvironmentBrowser();
    const platformBase: GitLabPlatformBase = {
      fetchFromApi,
      // browser won't let us change User-Agent header
      // so we don't have to construct it
      getUserAgentHeader: () => ({}),
    };

    return {
      getForActiveProject: () =>
        Promise.resolve({
          type: 'project',
          project: gitLabProject,
          ...platformBase,
        }),
      getForActiveAccount: async () => ({ type: 'account', ...platformBase }),
      getForAllAccounts: async () => [
        {
          type: 'account',
          ...platformBase,
        },
      ],
      getTelemetryEnvironment: () => telemetryEnvironment,
    };
  };
