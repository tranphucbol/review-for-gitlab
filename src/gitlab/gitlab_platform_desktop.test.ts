import { gitlabPlatformDesktop, DesktopPlatformProject } from './gitlab_platform_desktop';
import { getActiveProjectOrSelectOne, getActiveProject } from '../commands/run_with_valid_project';
import { GetRequest } from './api/rest';
import { projectInRepository } from '../test_utils/entities';
import { getGitLabService } from './get_gitlab_service';

jest.mock('../commands/run_with_valid_project', () => ({
  getActiveProject: jest.fn(),
  getActiveProjectOrSelectOne: jest.fn(),
}));

jest.mock('./get_gitlab_service', () => ({
  getGitLabService: jest.fn().mockReturnValue({
    fetchFromApi: jest.fn().mockResolvedValue('test_result'),
  }),
}));

describe('gitlabPlatformDesktop', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProject', () => {
    describe('non user interactive', () => {
      it('fetches the active project when an active project exists', async () => {
        (getActiveProjectOrSelectOne as jest.Mock).mockResolvedValue({
          project: {
            name: 'test',
          },
        });

        const project = await gitlabPlatformDesktop.getProject(false);
        expect(project).toBeDefined();
        expect(project?.project).toBe('test');
        expect(getActiveProjectOrSelectOne).toHaveBeenCalledTimes(1);
      });

      it('returns undefined when an active project does not exist', async () => {
        (getActiveProjectOrSelectOne as jest.Mock).mockResolvedValue(undefined);

        const project = await gitlabPlatformDesktop.getProject(false);
        expect(project).toBeUndefined();
        expect(getActiveProjectOrSelectOne).toHaveBeenCalledTimes(1);
      });
    });

    describe('user interactive', () => {
      it('fetches the active project when an active project exists', async () => {
        (getActiveProject as jest.Mock).mockResolvedValue({
          project: {
            name: 'test',
          },
        });

        const project = await gitlabPlatformDesktop.getProject(true);
        expect(project).toBeDefined();
        expect(project?.project).toBe('test');
        expect(getActiveProject).toHaveBeenCalledTimes(1);
      });

      it('returns undefined when an active project does not exist', async () => {
        (getActiveProject as jest.Mock).mockResolvedValue(undefined);

        const project = await gitlabPlatformDesktop.getProject(true);
        expect(project).toBeUndefined();
        expect(getActiveProject).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('fetchFromApi', () => {
    const req: GetRequest<string> = {
      type: 'api',
      method: 'GET',
      path: '/test',
    };

    it('calls makeAiRequest when a valid GitLab project is passed', async () => {
      const project = new DesktopPlatformProject(projectInRepository);
      const result = await gitlabPlatformDesktop.fetchFromApi(req, project);
      expect(result).toBe('test_result');
      expect(getGitLabService).toHaveBeenCalledWith(project.projectInRepository);
    });

    it('throws an error if a desktop platform project is not passed', async () => {
      const project = {
        project: 'test',
      };

      await expect(gitlabPlatformDesktop.fetchFromApi(req, project)).rejects.toThrowError();
    });
  });
});
