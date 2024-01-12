import * as vscode from 'vscode';
import { ExtensionState } from './extension_state';
import { accountService } from './accounts/account_service';
import { gitExtensionWrapper } from './git/git_extension_wrapper';
import { Account } from '../common/platform/gitlab_account';
import { GitLabPlatformManager } from '../common/platform/gitlab_platform';
import { createOAuthAccount, createTokenAccount } from './test_utils/entities';
import { createFakePartial } from '../common/test_utils/create_fake_partial';
import { getChatSupport } from '../common/chat/api/get_chat_support';

jest.mock('../common/chat/api/get_chat_support');

describe('extension_state', () => {
  let extensionState: ExtensionState;
  let mockedAccounts: Account[];
  let mockedRepositories: any[];
  let manager: GitLabPlatformManager;

  beforeEach(() => {
    mockedAccounts = [];
    mockedRepositories = [];
    manager = createFakePartial<GitLabPlatformManager>({});
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
    await extensionState.init(accountService, manager);

    const { executeCommand } = vscode.commands;
    expect(executeCommand).toHaveBeenCalledWith('setContext', 'gitlab:validState', validState);
    expect(executeCommand).toHaveBeenCalledWith('setContext', 'gitlab:noAccount', noToken);
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext',
      'gitlab:openRepositoryCount',
      openRepositoryCount,
    );
  });

  describe('gitlab:chatAvailable', () => {
    it.each([
      [false, false],
      [true, true],
    ])('is %s when getChatSupport() returns %s', async hasChatSupport => {
      jest.mocked(getChatSupport).mockResolvedValue(hasChatSupport);

      await extensionState.init(accountService, manager);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gitlab:chatAvailable',
        hasChatSupport,
      );
    });
    it('is false if there is no manager passed', async () => {
      await extensionState.init(accountService);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gitlab:chatAvailable',
        false,
      );
    });
  });

  it('sets gitlab:hasSaaSAccount to false if there is no SaaS account', async () => {
    mockedAccounts = [createTokenAccount('https://my_standalone_instance')];

    await extensionState.init(accountService, manager);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'gitlab:hasSaaSAccount',
      false,
    );
  });

  it('sets gitlab:hasSaaSAccount to true if there is a SaaS account', async () => {
    mockedAccounts = [createOAuthAccount()];

    await extensionState.init(accountService, manager);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'gitlab:hasSaaSAccount',
      true,
    );
  });

  it('fires event when valid state changes', async () => {
    await extensionState.init(accountService, manager);
    const listener = jest.fn();
    extensionState.onDidChangeValid(listener);
    // setting tokens and repositories makes extension state valid
    mockedAccounts = [createTokenAccount()];
    mockedRepositories = ['repository'];

    await extensionState.updateExtensionStatus();

    expect(listener).toHaveBeenCalled();
  });
});
