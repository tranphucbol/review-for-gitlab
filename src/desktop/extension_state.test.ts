import * as vscode from 'vscode';
import { ExtensionState } from './extension_state';
import { accountService } from './accounts/account_service';
import { gitExtensionWrapper } from './git/git_extension_wrapper';
import { Account } from '../common/platform/gitlab_account';
import { createOAuthAccount, createTokenAccount } from './test_utils/entities';

describe('extension_state', () => {
  let extensionState: ExtensionState;
  let mockedAccounts: Account[];
  let mockedRepositories: any[];

  beforeEach(() => {
    mockedAccounts = [];
    mockedRepositories = [];
    accountService.getAllAccounts = () => mockedAccounts;
    jest
      .spyOn(gitExtensionWrapper, 'gitRepositories', 'get')
      .mockImplementation(() => mockedRepositories);
    extensionState = new ExtensionState();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it.each`
    scenario                             | accounts                  | repositories        | validState | noToken  | openRepositoryCount
    ${'is invalid'}                      | ${[]}                     | ${[]}               | ${false}   | ${true}  | ${0}
    ${'is invalid without tokens'}       | ${[]}                     | ${['repository']}   | ${false}   | ${true}  | ${1}
    ${'is invalid without repositories'} | ${[createTokenAccount()]} | ${[]}               | ${false}   | ${false} | ${0}
    ${'is valid'}                        | ${[createTokenAccount()]} | ${[['repository']]} | ${true}    | ${false} | ${1}
  `('$scenario', async ({ accounts, repositories, validState, noToken, openRepositoryCount }) => {
    mockedAccounts = accounts;
    mockedRepositories = repositories;
    await extensionState.init(accountService);

    const { executeCommand } = vscode.commands;
    expect(executeCommand).toHaveBeenCalledWith('setContext', 'gitlab:validState', validState);
    expect(executeCommand).toHaveBeenCalledWith('setContext', 'gitlab:noAccount', noToken);
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext',
      'gitlab:openRepositoryCount',
      openRepositoryCount,
    );
  });

  it('sets gitlab:hasSaaSAccount to false if there is no SaaS account', async () => {
    mockedAccounts = [createTokenAccount('https://my_standalone_instance')];

    await extensionState.init(accountService);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'gitlab:hasSaaSAccount',
      false,
    );
  });

  it('sets gitlab:hasSaaSAccount to true if there is a SaaS account', async () => {
    mockedAccounts = [createOAuthAccount()];

    await extensionState.init(accountService);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'gitlab:hasSaaSAccount',
      true,
    );
  });

  it('fires event when valid state changes', async () => {
    await extensionState.init(accountService);
    const listener = jest.fn();
    extensionState.onDidChangeValid(listener);
    // setting tokens and repositories makes extension state valid
    mockedAccounts = [createTokenAccount()];
    mockedRepositories = ['repository'];

    await extensionState.updateExtensionStatus();

    expect(listener).toHaveBeenCalled();
  });
});
