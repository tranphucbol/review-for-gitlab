import { getActiveProject, getActiveProjectOrSelectOne } from '../commands/run_with_valid_project';
import { getGitLabService } from './get_gitlab_service';
import { GitLabPlatform, GitLabPlatformProject } from './gitlab_platform';
import { GitLabProject } from './gitlab_project';
import { ProjectInRepository } from './new_project';

const getProjectInRepository = async (userInitiated: boolean) => {
  let projectInRepository: ProjectInRepository | undefined;
  if (userInitiated) {
    projectInRepository = await getActiveProject();
  } else {
    projectInRepository = await getActiveProjectOrSelectOne();
  }

  return projectInRepository;
};

export class DesktopPlatformProject implements GitLabPlatformProject {
  #project: GitLabProject;

  readonly projectInRepository: ProjectInRepository;

  constructor(projectInRepository: ProjectInRepository) {
    this.#project = projectInRepository.project;
    this.projectInRepository = projectInRepository;
  }

  get project() {
    return this.#project.name;
  }
}

export const gitlabPlatformDesktop: GitLabPlatform = {
  getProject: async userInitiated => {
    const projectInRepository = await getProjectInRepository(userInitiated);
    if (!projectInRepository) {
      return undefined;
    }
    return new DesktopPlatformProject(projectInRepository);
  },
  fetchFromApi: async (req, project) => {
    if (!(project instanceof DesktopPlatformProject)) {
      throw new Error('unsupported project type');
    }

    return getGitLabService(project.projectInRepository).fetchFromApi(req);
  },
};
