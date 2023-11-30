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
import { gitlabProjectRepository } from './gitlab_project_repository';

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
    project: undefined,
    fetchFromApi: async req => getGitLabServiceForAccount(account).fetchFromApi(req),
    connectToCable: async () => getGitLabServiceForAccount(account).connectToCable(),
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
      account: projectInRepository.account,
      project: projectInRepository.project,
      fetchFromApi: async req => getGitLabService(projectInRepository).fetchFromApi(req),
      connectToCable: async () =>
        getGitLabServiceForAccount(projectInRepository.account).connectToCable(),
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

  // This is tricky
  // The project repository caches accounts.
  // When account changes, project repository updates this cache, but it takes long time
  // because it has to do several API requests. Until the API calls are done, the account cache is stale.
  // If we listened on accountChange here, results of the platform.getForActiveProject() method wouldn't
  // be guaranteed to have the up-to-date account because the platform uses project repository.
  // That's why we have to listen on project repository and not on account changes.
  // See sequence diagrams: https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/1174#note_1658575653
  onAccountChange: listener => gitlabProjectRepository.onProjectChange(() => listener()),

  getForAllAccounts: async () =>
    accountService.getAllAccounts().map(createGitLabPlatformForAccount),

  getForSaaSAccount: async () => {
    const account = accountService.getSaaSAccount();
    if (!account) {
      return undefined;
    }

    return createGitLabPlatformForAccount(account);
  },
};
