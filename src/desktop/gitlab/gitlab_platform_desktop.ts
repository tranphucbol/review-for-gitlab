import { getActiveProject, getActiveProjectOrSelectOne } from '../commands/run_with_valid_project';
import { getGitLabService, getGitLabServiceForAccount } from './get_gitlab_service';
import {
  GitLabPlatformForAccount,
  GitLabPlatformManager,
} from '../../common/platform/gitlab_platform';
import { ProjectInRepository } from './new_project';
import { getUserAgentHeader } from './http/get_user_agent_header';
import { pickAccount } from './pick_account';
import { accountService } from '../accounts/account_service';
import { Account } from '../../common/platform/gitlab_account';

const getProjectInRepository = async (userInitiated: boolean) => {
  let projectInRepository: ProjectInRepository | undefined;
  if (userInitiated) {
    projectInRepository = await getActiveProjectOrSelectOne();
  } else {
    projectInRepository = getActiveProject();
  }

  return projectInRepository;
};

function createGitLabPlatformForAccount(account: Account): GitLabPlatformForAccount {
  return {
    type: 'account',
    account,
    fetchFromApi: async req => getGitLabServiceForAccount(account).fetchFromApi(req),
    getUserAgentHeader,
  };
}

export const gitlabPlatformManagerDesktop: GitLabPlatformManager = {
  getForActiveProject: async userInitiated => {
    const projectInRepository = await getProjectInRepository(userInitiated);
    if (!projectInRepository) {
      return undefined;
    }
    return {
      type: 'project',
      project: projectInRepository.project,
      fetchFromApi: async req => getGitLabService(projectInRepository).fetchFromApi(req),
      getUserAgentHeader,
    };
  },

  getForActiveAccount: async () => {
    const account = await pickAccount();
    if (!account) {
      return undefined;
    }

    return createGitLabPlatformForAccount(account);
  },

  getForAllAccounts: async () =>
    accountService.getAllAccounts().map(createGitLabPlatformForAccount),
};
