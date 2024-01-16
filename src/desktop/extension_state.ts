import * as vscode from 'vscode';
import assert from 'assert';
import { AccountService } from './accounts/account_service';
import { gitExtensionWrapper } from './git/git_extension_wrapper';
import { GitLabPlatformManager } from '../common/platform/gitlab_platform';
import { getChatSupport } from '../common/chat/api/get_chat_support';

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

  private hasSaaSAccount(): boolean {
    assert(this.accountService, 'ExtensionState has not been initialized.');
    return this.accountService.getSaaSAccount() !== undefined;
  }

  isValid(): boolean {
    return this.hasAnyAccounts() && openRepositoryCount() > 0;
  }

  async updateExtensionStatus(): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'gitlab:noAccount', !this.hasAnyAccounts());
    await vscode.commands.executeCommand(
      'setContext',
      'gitlab:hasSaaSAccount',
      this.hasSaaSAccount(),
    );
    await vscode.commands.executeCommand(
      'setContext',
      'gitlab:openRepositoryCount',
      openRepositoryCount(),
    );

    const duoChatAvailable: boolean = this.manager ? await getChatSupport(this.manager) : false;
    await vscode.commands.executeCommand('setContext', 'gitlab:chatAvailable', duoChatAvailable);

    await vscode.commands.executeCommand('setContext', 'gitlab:validState', this.isValid());
    if (this.lastValid !== this.isValid()) {
      this.lastValid = this.isValid();
      this.changeValidEmitter.fire();
    }
  }
}

export const extensionState = new ExtensionState();
