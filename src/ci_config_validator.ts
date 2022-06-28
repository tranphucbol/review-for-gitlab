import * as vscode from 'vscode';
import assert from 'assert';
import { doNotAwait } from './utils/do_not_await';
import { ProjectCommand } from './commands/run_with_valid_project';
import { getGitLabService } from './gitlab/get_gitlab_service';

export const validate: ProjectCommand = async projectInRepository => {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    await vscode.window.showInformationMessage('GitLab Workflow: No open file.');
    return;
  }

  const content = editor.document.getText();
  const { project } = projectInRepository;
  assert(project, "Current folder doesn't contain a GitLab project");
  const { valid, errors } = await getGitLabService(projectInRepository).validateCIConfig(
    project,
    content,
  );

  if (valid) {
    doNotAwait(
      vscode.window.showInformationMessage('GitLab Workflow: Your CI configuration is valid.'),
    );
    return;
  }
  doNotAwait(vscode.window.showErrorMessage('GitLab Workflow: Invalid CI configuration.'));
  if (errors[0]) {
    doNotAwait(vscode.window.showErrorMessage(errors[0]));
  }
};
