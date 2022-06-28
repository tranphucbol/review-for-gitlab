import vscode from 'vscode';
import { install as installSourceMapSupport } from 'source-map-support';
import * as openers from './commands/openers';
import * as tokenInput from './token_input';
import { accountService } from './accounts/account_service';
import { extensionState } from './extension_state';
import { createSnippet } from './commands/create_snippet';
import { insertSnippet } from './commands/insert_snippet';
import * as ciConfigValidator from './ci_config_validator';
import { webviewController } from './webview_controller';
import { issuableDataProvider } from './tree_view/issuable_data_provider';
import { currentBranchDataProvider } from './tree_view/current_branch_data_provider';
import { initializeLogging, handleError } from './log';
import { GitContentProvider } from './review/git_content_provider';
import { REVIEW_URI_SCHEME, REMOTE_URI_SCHEME } from './constants';
import { USER_COMMANDS, PROGRAMMATIC_COMMANDS } from './command_names';
import { CiCompletionProvider } from './completion/ci_completion_provider';
import { gitExtensionWrapper } from './git/git_extension_wrapper';
import {
  toggleResolved,
  deleteComment,
  editComment as startEdit,
  cancelEdit,
  submitEdit,
  createComment,
  cancelFailedComment,
  retryFailedComment,
} from './commands/mr_discussion_commands';
import { hasCommentsDecorationProvider } from './review/has_comments_decoration_provider';
import { changeTypeDecorationProvider } from './review/change_type_decoration_provider';
import { checkoutMrBranch } from './commands/checkout_mr_branch';
import { cloneWiki } from './commands/clone_wiki';
import { createSnippetPatch } from './commands/create_snippet_patch';
import { applySnippetPatch } from './commands/apply_snippet_patch';
import { openMrFile } from './commands/open_mr_file';
import { GitLabRemoteFileSystem } from './remotefs/gitlab_remote_file_system';
import { openRepository } from './commands/open_repository';
import { contextUtils } from './utils/context_utils';
import { currentBranchRefresher } from './current_branch_refresher';
import { statusBar } from './status_bar';
import { runWithValidProject, runWithValidProjectFile } from './commands/run_with_valid_project';
import { triggerPipelineAction } from './commands/trigger_pipeline_action';
import { setSidebarViewState, SidebarViewState } from './tree_view/sidebar_view_state';
import { doNotAwait } from './utils/do_not_await';
import { gitlabProjectRepository } from './gitlab/gitlab_project_repository';
import {
  assignProject,
  clearSelectedProjects,
  selectProjectCommand,
  selectProjectForRepository,
} from './gitlab/select_project';
import { selectedProjectStore } from './gitlab/selected_project_store';
import {
  showIssueSearchInput,
  showMergeRequestSearchInput,
  showProjectAdvancedSearchInput,
} from './search_input';
import { migrateCredentials } from './accounts/credentials_migrator';
import { migrateSelectedProjects } from './gitlab/migrate_selected_projects';
import { gitlabUriHandler } from './gitlab_uri_handler';
import { authenticate } from './accounts/authenticate';
import { GitLabAuthenticationProvider } from './accounts/oauth/gitlab_authentication_provider';
import { getExtensionConfiguration, GITLAB_DEBUG_MODE } from './utils/extension_configuration';

const wrapWithCatch =
  (command: (...args: unknown[]) => unknown) =>
  async (...args: unknown[]) => {
    try {
      await command(...args);
    } catch (e) {
      handleError(e);
    }
  };

const registerSidebarTreeDataProviders = () => {
  vscode.window.registerTreeDataProvider('issuesAndMrs', issuableDataProvider);
  vscode.window.registerTreeDataProvider('currentBranchInfo', currentBranchDataProvider);
};

const registerCommands = (
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
) => {
  const commands = {
    [USER_COMMANDS.SHOW_ISSUES_ASSIGNED_TO_ME]: runWithValidProject(openers.showIssues),
    [USER_COMMANDS.SHOW_MERGE_REQUESTS_ASSIGNED_TO_ME]: runWithValidProject(
      openers.showMergeRequests,
    ),
    [USER_COMMANDS.AUTHENTICATE]: authenticate,
    [USER_COMMANDS.ADD_ACCOUNT]: tokenInput.addAccount,
    [USER_COMMANDS.REMOVE_ACCOUNT]: tokenInput.removeAccount,
    [USER_COMMANDS.OPEN_ACTIVE_FILE]: runWithValidProjectFile(openers.openActiveFile),
    [USER_COMMANDS.COPY_LINK_TO_ACTIVE_FILE]: runWithValidProjectFile(openers.copyLinkToActiveFile),
    [USER_COMMANDS.OPEN_CURRENT_MERGE_REQUEST]: runWithValidProject(
      openers.openCurrentMergeRequest,
    ),
    [USER_COMMANDS.OPEN_CREATE_NEW_ISSUE]: runWithValidProject(openers.openCreateNewIssue),
    [USER_COMMANDS.OPEN_CREATE_NEW_MR]: runWithValidProject(openers.openCreateNewMr),
    [USER_COMMANDS.OPEN_PROJECT_PAGE]: runWithValidProject(openers.openProjectPage),
    [USER_COMMANDS.PIPELINE_ACTIONS]: runWithValidProject(triggerPipelineAction),
    [USER_COMMANDS.ISSUE_SEARCH]: runWithValidProject(showIssueSearchInput),
    [USER_COMMANDS.MERGE_REQUEST_SEARCH]: runWithValidProject(showMergeRequestSearchInput),
    [USER_COMMANDS.PROJECT_ADVANCED_SEARCH]: runWithValidProject(showProjectAdvancedSearchInput),
    [USER_COMMANDS.COMPARE_CURRENT_BRANCH]: runWithValidProject(openers.compareCurrentBranch),
    [USER_COMMANDS.CREATE_SNIPPET]: runWithValidProject(createSnippet),
    [USER_COMMANDS.INSERT_SNIPPET]: runWithValidProject(insertSnippet),
    [USER_COMMANDS.VALIDATE_CI_CONFIG]: runWithValidProject(ciConfigValidator.validate),
    [PROGRAMMATIC_COMMANDS.SHOW_RICH_CONTENT]: webviewController.open.bind(webviewController),
    [USER_COMMANDS.SHOW_OUTPUT]: () => outputChannel.show(),
    [USER_COMMANDS.RESOLVE_THREAD]: toggleResolved,
    [USER_COMMANDS.UNRESOLVE_THREAD]: toggleResolved,
    [USER_COMMANDS.DELETE_COMMENT]: deleteComment,
    [USER_COMMANDS.START_EDITING_COMMENT]: startEdit,
    [USER_COMMANDS.CANCEL_EDITING_COMMENT]: cancelEdit,
    [USER_COMMANDS.SUBMIT_COMMENT_EDIT]: submitEdit,
    [USER_COMMANDS.CREATE_COMMENT]: createComment,
    [USER_COMMANDS.CHECKOUT_MR_BRANCH]: checkoutMrBranch,
    [USER_COMMANDS.CLONE_WIKI]: cloneWiki,
    [USER_COMMANDS.CREATE_SNIPPET_PATCH]: runWithValidProject(createSnippetPatch),
    [USER_COMMANDS.APPLY_SNIPPET_PATCH]: runWithValidProject(applySnippetPatch),
    [USER_COMMANDS.CANCEL_FAILED_COMMENT]: cancelFailedComment,
    [USER_COMMANDS.RETRY_FAILED_COMMENT]: retryFailedComment,
    [USER_COMMANDS.OPEN_REPOSITORY]: openRepository,
    [USER_COMMANDS.SIDEBAR_VIEW_AS_LIST]: () => setSidebarViewState(SidebarViewState.ListView),
    [USER_COMMANDS.SIDEBAR_VIEW_AS_TREE]: () => setSidebarViewState(SidebarViewState.TreeView),
    [USER_COMMANDS.REFRESH_SIDEBAR]: async () => {
      await accountService.reloadCache();
      await gitlabProjectRepository.reload();
      await currentBranchRefresher.refresh(true);
    },
    [USER_COMMANDS.OPEN_MR_FILE]: openMrFile,
    [USER_COMMANDS.SELECT_PROJECT_FOR_REPOSITORY]: selectProjectForRepository,
    [USER_COMMANDS.SELECT_PROJECT]: selectProjectCommand,
    [USER_COMMANDS.ASSIGN_PROJECT]: assignProject,
    [USER_COMMANDS.CLEAR_SELECTED_PROJECT]: clearSelectedProjects,
    [PROGRAMMATIC_COMMANDS.NO_IMAGE_REVIEW]: () =>
      vscode.window.showInformationMessage("GitLab MR review doesn't support images yet."),
  };

  Object.keys(commands).forEach(cmd => {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, wrapWithCatch(commands[cmd] as any)),
    );
  });
};

const registerCiCompletion = (context: vscode.ExtensionContext) => {
  const subscription = vscode.languages.registerCompletionItemProvider(
    { pattern: '**/*.gitlab-ci*.{yml,yaml}' },
    new CiCompletionProvider(),
    '$',
  );

  context.subscriptions.push(subscription);
};

const activateDebugMode = () => {
  const installSourceMapsIfDebug = () => {
    if (getExtensionConfiguration().debug) installSourceMapSupport();
  };
  installSourceMapsIfDebug();
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(GITLAB_DEBUG_MODE)) installSourceMapsIfDebug();
  });
};

/**
 * @param {vscode.ExtensionContext} context
 */
export const activate = async (context: vscode.ExtensionContext) => {
  activateDebugMode();
  contextUtils.init(context);
  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));
  vscode.workspace.registerTextDocumentContentProvider(REVIEW_URI_SCHEME, new GitContentProvider());
  vscode.workspace.registerFileSystemProvider(
    REMOTE_URI_SCHEME,
    new GitLabRemoteFileSystem(),
    GitLabRemoteFileSystem.OPTIONS,
  );
  registerCommands(context, outputChannel);
  const isDev = process.env.NODE_ENV === 'development';
  webviewController.init(context, isDev);
  await accountService.init(context).catch(e => {
    handleError(e);
    throw e;
  });
  selectedProjectStore.init(context);
  registerCiCompletion(context);
  vscode.window.registerUriHandler(gitlabUriHandler);
  context.subscriptions.push(gitExtensionWrapper);
  statusBar.init();
  context.subscriptions.push(statusBar);
  currentBranchRefresher.init(statusBar, currentBranchDataProvider);
  context.subscriptions.push(currentBranchRefresher);

  vscode.window.registerFileDecorationProvider(hasCommentsDecorationProvider);
  vscode.window.registerFileDecorationProvider(changeTypeDecorationProvider);
  vscode.authentication.registerAuthenticationProvider(
    'gitlab',
    'GitLab.com Authentication',
    new GitLabAuthenticationProvider(),
  );
  await extensionState.init(accountService);
  registerSidebarTreeDataProviders();
  await migrateCredentials(context, accountService).catch(e => handleError(e));
  await migrateSelectedProjects(selectedProjectStore, accountService).catch(e => handleError(e));
  // we don't want to hold the extension startup by waiting on VS Code and GitLab API
  doNotAwait(
    Promise.all([
      setSidebarViewState(SidebarViewState.ListView),
      gitExtensionWrapper.init(),
      gitlabProjectRepository.init(),
      currentBranchRefresher.refresh(),
    ]).catch(e => handleError(e)),
  );
};
