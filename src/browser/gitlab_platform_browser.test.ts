import * as vscode from 'vscode';
import {
  COMMAND_FETCH_FROM_API,
  COMMAND_GET_CONFIG,
  COMMAND_MEDIATOR_TOKEN,
} from '../common/platform/web_ide';
import { gqlProject, project } from '../common/test_utils/entities';
import { createGitLabPlatformManagerBrowser } from './gitlab_platform_browser';
import {
  GitLabPlatformForActiveProject,
  GitLabPlatformForAccount,
  GitLabPlatformManager,
} from '../common/platform/gitlab_platform';
import { getWebIdeExports } from './get_web_ide_exports';

const FAKE_MEDIATOR_TOKEN = 'fake-mediator-token';

jest.mock('./get_web_ide_exports');

describe('createGitLabPlatformManagerBrowser', () => {
  const mockCommandsForInitialSetup = () => {
    jest.mocked(vscode.commands.executeCommand).mockImplementation(async (cmd, token, arg) => {
      // what: token arg isn't used in mock implementation, but we add assertion in the `it`
      if (cmd === COMMAND_GET_CONFIG) {
        return { projectPath: 'gitlab-org/gitlab' };
      }
      if (
        cmd === COMMAND_FETCH_FROM_API &&
        arg?.variables.namespaceWithPath === 'gitlab-org/gitlab'
      ) {
        return { project: gqlProject };
      }
      if (cmd === COMMAND_MEDIATOR_TOKEN) {
        return FAKE_MEDIATOR_TOKEN;
      }
      throw new Error(`Unexpected command ${cmd} with arg ${JSON.stringify(arg)}`);
    });
  };

  describe('functionality', () => {
    let manager: GitLabPlatformManager;

    beforeEach(async () => {
      mockCommandsForInitialSetup();

      manager = await createGitLabPlatformManagerBrowser();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('without GitLab hosted project', () => {
      let platform: GitLabPlatformForAccount | undefined;

      beforeEach(async () => {
        platform = await manager.getForActiveAccount();
      });

      it('forwards all calls to fetchFromApi to the mediator command', async () => {
        expect(platform).toBeDefined();

        jest.resetAllMocks();

        const testRequest = { type: 'rest', method: 'GET', path: '/test' } as const;
        const testResponse = { value: 'test' };

        jest.mocked(vscode.commands.executeCommand).mockResolvedValue(testResponse);

        const result = await platform?.fetchFromApi(testRequest);

        expect(result).toEqual(testResponse);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          COMMAND_FETCH_FROM_API,
          FAKE_MEDIATOR_TOKEN,
          testRequest,
        );
      });
    });

    describe('with GitLab hosted project', () => {
      let platform: GitLabPlatformForActiveProject | undefined;

      beforeEach(async () => {
        platform = await manager.getForActiveProject(false);
      });

      it('calls mediator commands to get config and project from WebIDE', async () => {
        expect(platform).toBeDefined();
        expect(platform?.project).toEqual(project);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          COMMAND_GET_CONFIG,
          FAKE_MEDIATOR_TOKEN,
        );
      });

      it('forwards all calls to fetchFromApi to the mediator command', async () => {
        expect(platform).toBeDefined();

        jest.resetAllMocks();

        const testRequest = { type: 'rest', method: 'GET', path: '/test' } as const;
        const testResponse = { value: 'test' };

        jest.mocked(vscode.commands.executeCommand).mockResolvedValue(testResponse);

        const result = await platform?.fetchFromApi(testRequest);

        expect(result).toEqual(testResponse);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          COMMAND_FETCH_FROM_API,
          FAKE_MEDIATOR_TOKEN,
          testRequest,
        );
      });
    });
  });

  describe('isTelemetryEnabled', () => {
    let manager: GitLabPlatformManager;

    beforeEach(async () => {
      mockCommandsForInitialSetup();

      manager = await createGitLabPlatformManagerBrowser();
    });

    it.each([true, false])(
      'returns telemetry % when the Web IDE extension %',
      async telemetryStatus => {
        jest.mocked(getWebIdeExports).mockReturnValueOnce({
          isTelemetryEnabled() {
            return telemetryStatus;
          },
        });

        const platform = await manager.getForActiveProject(true);

        expect(platform?.isTelemetryEnabled()).toBe(telemetryStatus);
      },
    );
  });
});
