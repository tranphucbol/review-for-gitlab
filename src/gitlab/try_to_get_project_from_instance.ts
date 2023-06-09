import { Account } from '../accounts/account';
import { log } from '../log';
import { convertToGitLabProject, getProject } from './api/get_project';
import { getGitLabServiceForAccount } from './get_gitlab_service';
import { GitLabProject } from './gitlab_project';

export const tryToGetProjectFromInstance = async (
  account: Account,
  namespaceWithPath: string,
): Promise<GitLabProject | undefined> => {
  const { project } = await getGitLabServiceForAccount(account)
    .fetchFromApi(getProject(namespaceWithPath))
    .catch(e => {
      log.error(e);
      return { project: undefined };
    });

  return project && convertToGitLabProject(project);
};
