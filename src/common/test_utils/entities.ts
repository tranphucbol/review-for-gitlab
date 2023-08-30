import { GqlProject, convertToGitLabProject } from '../gitlab/api/get_project';
import { Account } from '../platform/gitlab_account';
import { GitLabProject } from '../platform/gitlab_project';

export const gqlProject: GqlProject = {
  id: 'gid://gitlab/Project/5261717',
  name: 'gitlab-vscode-extension',
  description: '',
  fullPath: 'gitlab-org/gitlab-vscode-extension',
  webUrl: 'https://gitlab.com/gitlab-org/gitlab-vscode-extension',
  group: {
    id: 'gid://gitlab/Group/9970',
  },
};

export const project: GitLabProject = convertToGitLabProject(gqlProject);

export const account: Account = {
  username: 'foobar',
  id: 'foobar',
  type: 'token',
  instanceUrl: 'gitlab-instance.xx',
  token: 'foobar-token',
};
