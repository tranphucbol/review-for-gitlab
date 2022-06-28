import * as vscode from 'vscode';
import assert from 'assert';
import * as openers from './openers';
import { VISIBILITY_OPTIONS } from './create_snippet';
import { PATCH_FILE_SUFFIX, PATCH_TITLE_PREFIX } from '../constants';
import { ProjectCommand } from './run_with_valid_project';
import { getLastCommitSha } from '../git/get_last_commit_sha';
import { getTrackingBranchName } from '../git/get_tracking_branch_name';
import { getGitLabService } from '../gitlab/get_gitlab_service';

const getSnippetPatchDescription = (
  branch: string,
  commit: string,
  patchFileName: string,
): string => `
This snippet contains suggested changes for branch ${branch} (commit: ${commit}).

Apply this snippet:

- In VS Code with the GitLab Workflow extension installed:
  - Run \`GitLab: Apply snippet patch\` and select this snippet
- Using the \`git\` command:
  - Download the \`${patchFileName}\` file to your project folder
  - In your project folder, run

    ~~~sh
    git apply '${patchFileName}'
    ~~~

*This snippet was created with the [GitLab Workflow VS Code extension](https://marketplace.visualstudio.com/items?itemName=GitLab.gitlab-workflow).*
`;

export const createSnippetPatch: ProjectCommand = async projectInRepository => {
  const { repository } = projectInRepository.pointer;
  assert(getLastCommitSha(repository.rawRepository));
  const patch = await repository.rawRepository.diff();
  const name = await vscode.window.showInputBox({
    placeHolder: 'patch name',
    prompt:
      'The name is used as the snippet title and also as the filename (with .patch appended).',
  });
  if (!name) return;
  const visibility = await vscode.window.showQuickPick(VISIBILITY_OPTIONS);
  if (!visibility) return;

  const { project } = projectInRepository;
  const patchFileName = `${name}${PATCH_FILE_SUFFIX}`;
  const data = {
    title: `${PATCH_TITLE_PREFIX}${name}`,
    description: getSnippetPatchDescription(
      await getTrackingBranchName(repository.rawRepository),
      getLastCommitSha(repository.rawRepository)!,
      patchFileName,
    ),
    file_name: patchFileName,
    visibility: visibility.type,
    content: patch,
  };

  const snippet = await getGitLabService(projectInRepository).createSnippet(project, data);

  await openers.openUrl(snippet.web_url);
};
