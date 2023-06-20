import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../common/platform/gitlab_platform';
import {
  COMMAND_FETCH_FROM_API,
  COMMAND_GET_CONFIG,
  InteropConfig,
  fetchFromApi,
} from '../common/platform/web_ide';
import { convertToGitLabProject, getProject } from '../common/gitlab/api/get_project';

const fetchFromApi: fetchFromApi = async request =>
  vscode.commands.executeCommand(COMMAND_FETCH_FROM_API, request);

const getConfig: () => Promise<InteropConfig> = async () =>
  vscode.commands.executeCommand(COMMAND_GET_CONFIG);

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
    return {
      getForActiveProject: () =>
        Promise.resolve({
          project: gitLabProject,
          fetchFromApi,
        }),
    };
  };
