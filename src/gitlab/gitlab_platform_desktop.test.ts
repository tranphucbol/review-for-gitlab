import { gitlabPlatformManagerDesktop } from './gitlab_platform_desktop';
import { getActiveProjectOrSelectOne, getActiveProject } from '../commands/run_with_valid_project';
import { GetRequest } from './api/rest';
import { gqlProject, project, projectInRepository } from '../test_utils/entities';
import { getGitLabService } from './get_gitlab_service';
import { asMock } from '../test_utils/as_mock';

jest.mock('../commands/run_with_valid_project', () => ({
  getActiveProject: jest.fn(),
  getActiveProjectOrSelectOne: jest.fn(),
}));

jest.mock('./get_gitlab_service', () => ({
  getGitLabService: jest.fn(),
}));

describe('gitlabPlatformManagerDesktop', () => {
  afterEach(() => {
    jest.clearAllMocks();
    (getGitLabService as jest.Mock).mockReturnValue({
      fetchFromApi: async () => gqlProject,
    });
  });

  describe('getForActiveProject', () => {
    describe('non user interactive', () => {
      it('fetches the platform for active project when an active project exists', async () => {
        (getActiveProject as jest.Mock).mockResolvedValue(projectInRepository);

        const platform = await gitlabPlatformManagerDesktop.getForActiveProject(false);
        expect(platform).toBeDefined();
        expect(platform?.project).toEqual(project);
        expect(getActiveProject).toHaveBeenCalledTimes(1);
      });

      it('returns undefined when an active project does not exist', async () => {
        (getActiveProject as jest.Mock).mockResolvedValue(undefined);

        const platform = await gitlabPlatformManagerDesktop.getForActiveProject(false);
        expect(platform).toBeUndefined();
        expect(getActiveProject).toHaveBeenCalledTimes(1);
      });
    });

    describe('user interactive', () => {
      it('fetches the platform for active project when an active project exists', async () => {
        (getActiveProjectOrSelectOne as jest.Mock).mockResolvedValue(projectInRepository);

        const platform = await gitlabPlatformManagerDesktop.getForActiveProject(true);
        expect(platform).toBeDefined();
        expect(platform?.project).toEqual(project);
        expect(getActiveProjectOrSelectOne).toHaveBeenCalledTimes(1);
      });

      it('returns undefined when an active project does not exist', async () => {
        (getActiveProjectOrSelectOne as jest.Mock).mockResolvedValue(undefined);

        const platform = await gitlabPlatformManagerDesktop.getForActiveProject(true);
        expect(platform).toBeUndefined();
      });
    });
  });

  describe('fetchFromApi', () => {
    const req: GetRequest<string> = {
      type: 'rest',
      method: 'GET',
      path: '/test',
    };

    it('calls fetchFromApi', async () => {
      asMock(getActiveProject).mockResolvedValue(projectInRepository);
      const platform = await gitlabPlatformManagerDesktop.getForActiveProject(false);
      const result = await platform?.fetchFromApi(req);
      expect(result).toBe(gqlProject);
      expect(getGitLabService).toHaveBeenCalledWith(projectInRepository);
    });
  });
});
