import * as vscode from 'vscode';
import { COMMAND_FETCH_FROM_API, COMMAND_GET_CONFIG } from '../common/platform/web_ide';
import { gqlProject, project } from '../desktop/test_utils/entities';
import { createGitLabPlatformManagerBrowser } from './gitlab_platform_browser';

describe('createGitLabPlatformManagerBrowser', () => {
  const mockCommandsForInitialSetup = () => {
    jest.mocked(vscode.commands.executeCommand).mockImplementation(async (cmd, arg) => {
      if (cmd === COMMAND_GET_CONFIG) {
        return { projectPath: 'gitlab-org/gitlab' };
      }
      if (
        cmd === COMMAND_FETCH_FROM_API &&
        arg?.variables.namespaceWithPath === 'gitlab-org/gitlab'
      ) {
        return { project: gqlProject };
      }
      throw new Error(`Unexpected command ${cmd} with arg ${JSON.stringify(arg)}`);
    });
  };

  it('calls mediator commands to get config and project from WebIDE', async () => {
    mockCommandsForInitialSetup();

    const manager = await createGitLabPlatformManagerBrowser();
    const platform = await manager.getForActiveProject(false);

    expect(platform).toBeDefined();
    expect(platform?.project).toEqual(project);
  });

  it('forwards all calls to fetchFromApi to the mediator command', async () => {
    mockCommandsForInitialSetup();

    const manager = await createGitLabPlatformManagerBrowser();
    const platform = await manager.getForActiveProject(false);

    expect(platform).toBeDefined();

    jest.resetAllMocks();

    const testRequest = { type: 'rest', method: 'GET', path: '/test' } as const;
    const testResponse = { value: 'test' };

    jest.mocked(vscode.commands.executeCommand).mockResolvedValue(testResponse);

    const result = await platform?.fetchFromApi(testRequest);

    expect(result).toEqual(testResponse);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      COMMAND_FETCH_FROM_API,
      testRequest,
    );
  });
});
