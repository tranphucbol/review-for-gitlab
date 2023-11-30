import { gitlabPlatformManagerDesktop } from './gitlab_platform_desktop';
import { getActiveProjectOrSelectOne, getActiveProject } from '../commands/run_with_valid_project';
import { projectInRepository } from '../test_utils/entities';
import { gqlProject, project } from '../../common/test_utils/entities';
import { getGitLabService, getGitLabServiceForAccount } from './get_gitlab_service';
import { asMock } from '../test_utils/as_mock';
import { GetRequest } from '../../common/platform/web_ide';
import { pickAccount } from './pick_account';
import { testCredentials } from '../test_utils/test_credentials';
import { Credentials } from '../../common/platform/gitlab_account';

jest.mock('./pick_account', () => ({
  pickAccount: jest.fn(),
}));

let saasAccount: Credentials | undefined;
jest.mock('../accounts/account_service', () => ({
  accountService: {
    getSaaSAccount: jest.fn().mockImplementation(() => saasAccount),
  },
}));

jest.mock('./gitlab_project_repository', () => ({
  gitlabProjectRepository: {
    onProjectChange: jest.fn(listener => listener([])), // immediately invoke added listener
  },
}));

jest.mock('../commands/run_with_valid_project', () => ({
  getActiveProject: jest.fn(),
  getActiveProjectOrSelectOne: jest.fn(),
}));

jest.mock('./get_gitlab_service', () => ({
  getGitLabService: jest.fn(),
  getGitLabServiceForAccount: jest.fn(),
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

  describe('getForActiveAccount', () => {
    it('fetches the platform for active account when an active account exists', async () => {
      (pickAccount as jest.Mock).mockImplementation(() => testCredentials('https://example.com'));

      const platform = await gitlabPlatformManagerDesktop.getForActiveAccount();
      expect(platform).toBeDefined();
      expect(pickAccount).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when there is no account', async () => {
      (pickAccount as jest.Mock).mockResolvedValue(undefined);

      const platform = await gitlabPlatformManagerDesktop.getForActiveAccount();
      expect(platform).toBeUndefined();
      expect(pickAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe('onAccountChange', () => {
    it('listens on project changes (as proxy to account changes)', async () => {
      const listener = jest.fn();

      gitlabPlatformManagerDesktop.onAccountChange(listener); // the project repository mock will immediately call the listener

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getForSaaSAccount', () => {
    it('fetches the platform for active SaaS account when it exists', async () => {
      saasAccount = testCredentials('https://gitlab.com');

      const platform = await gitlabPlatformManagerDesktop.getForSaaSAccount();
      expect(platform).toBeDefined();
    });

    it('returns undefined when there is noactive SaaS account', async () => {
      saasAccount = undefined;

      const platform = await gitlabPlatformManagerDesktop.getForSaaSAccount();
      expect(platform).toBeUndefined();
    });
  });

  describe('fetchFromApi', () => {
    const req: GetRequest<string> = {
      type: 'rest',
      method: 'GET',
      path: '/test',
    };

    describe('with GitLabPlatformForActiveAccount', () => {
      it('calls fetchFromApi', async () => {
        (pickAccount as jest.Mock).mockImplementation(() => testCredentials('https://example.com'));
        (getGitLabServiceForAccount as jest.Mock).mockReturnValue({
          fetchFromApi: async () => gqlProject,
        });

        const platform = await gitlabPlatformManagerDesktop.getForActiveAccount();
        const result = await platform?.fetchFromApi(req);
        expect(result).toBe(gqlProject);
        expect(getGitLabServiceForAccount).toHaveBeenCalledTimes(1);
      });
    });

    it('calls fetchFromApi', async () => {
      asMock(getActiveProject).mockResolvedValue(projectInRepository);
      const platform = await gitlabPlatformManagerDesktop.getForActiveProject(false);
      const result = await platform?.fetchFromApi(req);
      expect(result).toBe(gqlProject);
      expect(getGitLabService).toHaveBeenCalledWith(projectInRepository);
    });
  });

  describe('connectToCable', () => {
    const connectionMock = jest.fn();

    it('calls connectToCable on gitlabService', async () => {
      (getGitLabServiceForAccount as jest.Mock).mockReturnValue({
        connectToCable: async () => connectionMock,
      });

      const platform = await gitlabPlatformManagerDesktop.getForActiveAccount();
      const result = await platform?.connectToCable();
      expect(result).toBe(connectionMock);
      expect(getGitLabServiceForAccount).toHaveBeenCalledTimes(1);
    });
  });
});
