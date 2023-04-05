import vscode from 'vscode';
import path from 'path';
import { GitRepository } from '../../git/new_git';
import { USER_COMMANDS } from '../../command_names';

export class MultipleProjectsItem extends vscode.TreeItem {
  repository: GitRepository;

  constructor(repository: GitRepository) {
    const folderName = path.basename(repository.rootFsPath);
    super(`${folderName} (multiple projects)`);
    this.repository = repository;
    this.iconPath = new vscode.ThemeIcon('warning');
    this.contextValue = 'multiple-projects-detected';
    this.command = {
      command: USER_COMMANDS.SELECT_PROJECT,
      title: 'Select GitLab Project',
      arguments: [this],
    };
  }
}
