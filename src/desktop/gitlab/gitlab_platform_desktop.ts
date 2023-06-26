import { getActiveProject, getActiveProjectOrSelectOne } from '../commands/run_with_valid_project';
import { getGitLabService } from './get_gitlab_service';
import { GitLabPlatformManager } from '../../common/platform/gitlab_platform';
import { ProjectInRepository } from './new_project';
import { getUserAgentHeader } from './http/get_user_agent_header';

const getProjectInRepository = async (userInitiated: boolean) => {
  let projectInRepository: ProjectInRepository | undefined;
  if (userInitiated) {
    projectInRepository = await getActiveProjectOrSelectOne();
  } else {
    projectInRepository = getActiveProject();
  }

  return projectInRepository;
};

export const gitlabPlatformManagerDesktop: GitLabPlatformManager = {
  getForActiveProject: async userInitiated => {
    const projectInRepository = await getProjectInRepository(userInitiated);
    if (!projectInRepository) {
      return undefined;
    }
    return {
      project: projectInRepository.project,
      fetchFromApi: async req => getGitLabService(projectInRepository).fetchFromApi(req),
      getUserAgentHeader,
    };
  },
};
