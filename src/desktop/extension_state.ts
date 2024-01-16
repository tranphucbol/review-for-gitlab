import * as vscode from 'vscode';
import assert from 'assert';
import { AccountService } from './accounts/account_service';
import { gitExtensionWrapper } from './git/git_extension_wrapper';
import { GitLabPlatformManager } from '../common/platform/gitlab_platform';

const openRepositoryCount = (): number => gitExtensionWrapper.gitRepositories.length;
export class ExtensionState {
  private changeValidEmitter = new vscode.EventEmitter<void>();

  onDidChangeValid = this.changeValidEmitter.event;

  accountService?: AccountService;

  manager?: GitLabPlatformManager;

  private lastValid = false;

  async init(accountService: AccountService, manager?: GitLabPlatformManager): Promise<void> {
    this.accountService = accountService;
    this.manager = manager;
    this.lastValid = this.isValid();
    accountService.onDidChange(this.updateExtensionStatus, this);
    gitExtensionWrapper.onRepositoryCountChanged(this.updateExtensionStatus, this);
    await this.updateExtensionStatus();
  }

  private hasAnyAccounts(): boolean {
    assert(this.accountService, 'ExtensionState has not been initialized.');
    return this.accountService.getAllAccounts().length > 0;
  }

  isValid(): boolean {
    return this.hasAnyAccounts() && openRepositoryCount() > 0;
  }

  async updateExtensionStatus(): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'gitlab:noAccount', !this.hasAnyAccounts());
    await vscode.commands.executeCommand(
      'setContext',
      'gitlab:openRepositoryCount',
      openRepositoryCount(),
    );

    await vscode.commands.executeCommand('setContext', 'gitlab:validState', this.isValid());
    if (this.lastValid !== this.isValid()) {
      this.lastValid = this.isValid();
      this.changeValidEmitter.fire();
    }
  }
}

export const extensionState = new ExtensionState();
