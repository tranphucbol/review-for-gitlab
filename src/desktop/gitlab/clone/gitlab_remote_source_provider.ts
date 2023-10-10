import { RemoteSource, RemoteSourceProvider } from '../../api/git';
import { GitLabService } from '../gitlab_service';
import { Account } from '../../../common/platform/gitlab_account';
import { getGitLabServiceForAccount } from '../get_gitlab_service';
import {
  GqlProjectWithRepoInfo,
  getProjectWithRepositoryInfo,
  getProjectsWithRepositoryInfo,
} from '../api/get_projects_with_repository_info';

export function convertUrlToWikiUrl(url: string): string {
  return url.replace(/\.git$/, '.wiki.git');
}

export type GitLabRemote = RemoteSource & {
  project: GqlProjectWithRepoInfo;
  url: string[];
  wikiUrl: string[];
};

export function remoteForProject(project: GqlProjectWithRepoInfo): GitLabRemote {
  const url = [project.sshUrlToRepo, project.httpUrlToRepo];

  return {
    name: `$(repo) ${project.fullPath}`,
    description: project.description,
    url,
    wikiUrl: url.map(convertUrlToWikiUrl),
    project,
  };
}

export class GitLabRemoteSourceProvider implements RemoteSourceProvider {
  name: string;

  readonly icon = 'project';

  readonly supportsQuery = true;

  private gitlabService: GitLabService;

  constructor(account: Account) {
    this.name = `GitLab (${account.instanceUrl} - ${account.username})`;
    this.gitlabService = getGitLabServiceForAccount(account);
  }

  async lookupByPath(path: string): Promise<GitLabRemote | undefined> {
    const { project } = await this.gitlabService.fetchFromApi(getProjectWithRepositoryInfo(path));
    if (!project) return undefined;

    return remoteForProject(project);
  }

  async getRemoteSources(query?: string): Promise<GitLabRemote[]> {
    const result = await this.gitlabService.fetchFromApi(
      getProjectsWithRepositoryInfo({
        search: query,
      }),
    );

    return result.projects.nodes
      .filter(project => !project.repository?.empty)
      .map(project => remoteForProject(project));
  }
}
