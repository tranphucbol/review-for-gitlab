import vscode from 'vscode';
import { install as installSourceMapSupport } from 'source-map-support';
import * as openers from './commands/openers';
import * as tokenInput from './token_input';
import { accountService } from './accounts/account_service';
import { extensionState } from './extension_state';
import { initializeNetworkAgent } from './fetch';
import { setupCodeSuggestionsPromo } from './code_suggestions_promo';
import { createSnippet } from './commands/create_snippet';
import { insertSnippet } from './commands/insert_snippet';
import { validateCiConfig, showMergedCiConfig } from './commands/ci_config_lint_commands';
import { issuableController } from './issuable_controller';
import { issuableDataProvider } from './tree_view/issuable_data_provider';
import { currentBranchDataProvider } from './tree_view/current_branch_data_provider';
import { initializeLogging } from '../common/log';
import { handleError } from '../common/errors/handle_error';
import { ReviewFileSystem } from './review/review_file_system';
import { GqlSecurityFinding } from './gitlab/security_findings/api/get_security_finding_report';
import { ProjectInRepository } from './gitlab/new_project';
import {
  REVIEW_URI_SCHEME,
  REMOTE_URI_SCHEME,
  MERGED_YAML_URI_SCHEME,
  JOB_LOG_URI_SCHEME,
} from './constants';
import { USER_COMMANDS, PROGRAMMATIC_COMMANDS } from './command_names';
import { CiCompletionProvider } from './ci/ci_completion_provider';
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
import { registerCommentAttachmentProviders } from './review/comment_attachment_provider';
import { registerReviewLanguageFeatures } from './review/review_language_features';
import { hasCommentsDecorationProvider } from './review/has_comments_decoration_provider';
import { changeTypeDecorationProvider } from './review/change_type_decoration_provider';
import { checkoutMrBranch } from './commands/checkout_mr_branch';
import { updateMrBranch } from './commands/update_mr_branch';
import { mergeRequestActions } from './commands/merge_request_actions/merge_request_actions';
import { openInGitLab, copyLinkToClipboard } from './commands/open_in_gitlab';
import { cloneWiki } from './commands/clone_wiki';
import { createSnippetPatch } from './commands/create_snippet_patch';
import { downloadArtifacts } from './commands/download_artifact';
import { applySnippetPatch } from './commands/apply_snippet_patch';
import { openMrFile } from './commands/open_mr_file';
import { openMrFileSideBySide } from './commands/open_mr_file_side_by_side';
import { mrDiffPanelController } from './review/side_by_side/mr_diff_panel_controller';
import { affectsEditorFont } from './review/side_by_side/editor_font';
import { JIRA_CONFIG_SECTION } from './jira/jira_keys';
import { openJiraIssue } from './jira/open_jira_issue';
import {
  MERGE_REQUEST_DIFF_VIEWER,
  SHOW_LOCAL_CHANGE_BUTTONS,
} from './review/side_by_side/merge_request_diff_viewer';
import { GitLabRemoteFileSystem } from './remotefs/gitlab_remote_file_system';
import { openRepository } from './commands/open_repository';
import { contextUtils } from './utils/context_utils';
import { currentBranchRefresher } from './current_branch_refresher';
import { statusBar } from './status_bar';
import {
  registerRepositoryRootProvider,
  runWithValidProject,
  runWithValidProjectFile,
} from './commands/run_with_valid_project';
import { triggerPipelineAction } from './commands/trigger_pipeline_action';
import {
  getSidebarViewState,
  setSidebarViewState,
  SidebarViewState,
} from './tree_view/sidebar_view_state';
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
  showAdvancedSearchInput,
} from './search_input';
import { migrateCredentials } from './accounts/credentials_migrator';
import { gitlabUriHandler } from './gitlab_uri_handler';
import { authenticate } from './accounts/authenticate';
import { GitLabAuthenticationProvider } from './accounts/oauth/gitlab_authentication_provider';
import {
  getExtensionConfiguration,
  GITLAB_DEBUG_MODE,
} from '../common/utils/extension_configuration';
import * as featureFlags from '../common/feature_flags';
import { setupVersionCheck } from './gitlab/check_version';
import { setupYamlSupport } from './yaml_support';
import { cancelJob, executeJob, retryJob } from './commands/job_actions';
import { MergedYamlContentProvider } from './ci/merged_yaml_content_provider';
import { cancelPipeline, retryPipeline } from './commands/pipeline_actions';
import { openTraceArtifact } from './commands/open_trace_artifact';
import { JobLogContentProvider } from './ci/job_log_content_provider';
import { saveRawJobTrace } from './ci/save_raw_job_trace';
import { JobLogFoldingProvider } from './ci/job_log_folding_provider';
import { scrollToBottom } from './ci/scroll_to_bottom_command';
import { pendingWebviewController } from './ci/pending_job_webview_controller';
import { securityFindingWebviewController } from './ci/security_finding_controller';
import { JobItemModel } from './tree_view/items/job_item_model';
import { activateCommon } from '../common/main';
import { wrapCommandWithCatch } from '../common/utils/wrap_command_with_catch';
import { registerLanguageServer } from '../common/language_server/register_language_server';
import { CodeSuggestions } from '../common/code_suggestions/code_suggestions';
import { desktopLanguageClientFactory } from './language_server/desktop_language_client_factory';
import { createDependencyContainer } from './dependency_container_desktop';
import { validateAccounts } from './commands/validate_accounts';

const registerSidebarTreeDataProviders = () => {
  vscode.window.registerTreeDataProvider('issuesAndMrs', issuableDataProvider);
  vscode.window.registerTreeDataProvider('currentBranchInfo', currentBranchDataProvider);
};

const registerCommands = (context: vscode.ExtensionContext) => {
  const commands = {
    [USER_COMMANDS.SHOW_ISSUES_ASSIGNED_TO_ME]: runWithValidProject(openers.showIssues),
    [USER_COMMANDS.SHOW_MERGE_REQUESTS_ASSIGNED_TO_ME]: runWithValidProject(
      openers.showMergeRequests,
    ),
    [USER_COMMANDS.AUTHENTICATE]: authenticate,
    [USER_COMMANDS.ADD_ACCOUNT]: tokenInput.addAccount,
    [USER_COMMANDS.REMOVE_ACCOUNT]: tokenInput.removeAccount,
    [USER_COMMANDS.VALIDATE_ACCOUNTS]: validateAccounts,
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
    [USER_COMMANDS.ADVANCED_SEARCH]: runWithValidProject(showAdvancedSearchInput),
    [USER_COMMANDS.COMPARE_CURRENT_BRANCH]: runWithValidProject(openers.compareCurrentBranch),
    [USER_COMMANDS.CREATE_SNIPPET]: runWithValidProject(createSnippet),
    [USER_COMMANDS.INSERT_SNIPPET]: runWithValidProject(insertSnippet),
    [USER_COMMANDS.VALIDATE_CI_CONFIG]: runWithValidProject(validateCiConfig),
    [USER_COMMANDS.SHOW_MERGED_CI_CONFIG]: runWithValidProject(showMergedCiConfig),
    [PROGRAMMATIC_COMMANDS.SHOW_RICH_CONTENT]: issuableController.open.bind(issuableController),
    [USER_COMMANDS.RESOLVE_THREAD]: toggleResolved,
    [USER_COMMANDS.UNRESOLVE_THREAD]: toggleResolved,
    [USER_COMMANDS.DELETE_COMMENT]: deleteComment,
    [USER_COMMANDS.START_EDITING_COMMENT]: startEdit,
    [USER_COMMANDS.CANCEL_EDITING_COMMENT]: cancelEdit,
    [USER_COMMANDS.SUBMIT_COMMENT_EDIT]: submitEdit,
    [USER_COMMANDS.CREATE_COMMENT]: createComment,
    [USER_COMMANDS.CHECKOUT_MR_BRANCH]: checkoutMrBranch,
    [USER_COMMANDS.UPDATE_MR_BRANCH]: updateMrBranch,
    [USER_COMMANDS.MERGE_REQUEST_ACTIONS]: mergeRequestActions,
    [USER_COMMANDS.OPEN_JIRA_ISSUE]: openJiraIssue,
    [USER_COMMANDS.OPEN_IN_GITLAB]: openInGitLab,
    [USER_COMMANDS.COPY_LINK_TO_CLIPBOARD]: copyLinkToClipboard,
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
    [USER_COMMANDS.OPEN_MR_FILE_SIDE_BY_SIDE]: openMrFileSideBySide,
    [USER_COMMANDS.SELECT_PROJECT_FOR_REPOSITORY]: selectProjectForRepository,
    [USER_COMMANDS.SELECT_PROJECT]: selectProjectCommand,
    [USER_COMMANDS.ASSIGN_PROJECT]: assignProject,
    [USER_COMMANDS.CLEAR_SELECTED_PROJECT]: clearSelectedProjects,
    [USER_COMMANDS.DOWNLOAD_ARTIFACTS]: downloadArtifacts,
    [USER_COMMANDS.OPEN_IN_BROWSER]: openers.openPipelineUri,
    [USER_COMMANDS.OPEN_TRACE_ARTIFACT]: openTraceArtifact,
    [USER_COMMANDS.WAIT_FOR_PENDING_JOB]: async (item: JobItemModel) => {
      await pendingWebviewController.waitForPendingJob(item);
    },
    [USER_COMMANDS.VIEW_SECURITY_FINDING]: async (
      item: GqlSecurityFinding,
      projectInRepository: ProjectInRepository,
    ) => {
      await securityFindingWebviewController.open(item, projectInRepository);
    },
    [USER_COMMANDS.SAVE_RAW_JOB_TRACE]: saveRawJobTrace,
    [USER_COMMANDS.SCROLL_TO_BOTTOM]: scrollToBottom,
    [USER_COMMANDS.EXECUTE_JOB]: executeJob,
    [USER_COMMANDS.RETRY_JOB]: retryJob,
    [USER_COMMANDS.CANCEL_JOB]: cancelJob,
    [USER_COMMANDS.RETRY_FAILED_PIPELINE_JOBS]: retryPipeline,
    [USER_COMMANDS.CANCEL_PIPELINE]: cancelPipeline,
  };

  Object.keys(commands).forEach(cmd => {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, wrapCommandWithCatch(commands[cmd])),
    );
  });
};

const registerCiCompletion = (context: vscode.ExtensionContext) => {
  const subscription = vscode.languages.registerCompletionItemProvider(
    { pattern: '**/*.gitlab-ci*.{yml,yaml}' },
    new CiCompletionProvider(),
    '$',
    '{',
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
  initializeNetworkAgent();
  contextUtils.init(context);

  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));
  vscode.workspace.registerFileSystemProvider(
    REVIEW_URI_SCHEME,
    new ReviewFileSystem(),
    ReviewFileSystem.OPTIONS,
  );
  vscode.workspace.registerTextDocumentContentProvider(
    MERGED_YAML_URI_SCHEME,
    new MergedYamlContentProvider(),
  );
  const jobLogContentProvider = new JobLogContentProvider(context);
  vscode.workspace.registerTextDocumentContentProvider(JOB_LOG_URI_SCHEME, jobLogContentProvider);
  vscode.languages.registerFoldingRangeProvider(
    { scheme: JOB_LOG_URI_SCHEME },
    new JobLogFoldingProvider(),
  );
  vscode.workspace.registerFileSystemProvider(
    REMOTE_URI_SCHEME,
    new GitLabRemoteFileSystem(),
    GitLabRemoteFileSystem.OPTIONS,
  );
  registerCommands(context);
  registerCommentAttachmentProviders(context);
  registerReviewLanguageFeatures(context);
  issuableController.init(context);
  mrDiffPanelController.init(context);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      // changed files pick the command for the configured diff viewer when they render
      if (e.affectsConfiguration(MERGE_REQUEST_DIFF_VIEWER))
        await setSidebarViewState(getSidebarViewState());
      if (e.affectsConfiguration(SHOW_LOCAL_CHANGE_BUTTONS))
        mrDiffPanelController.refreshLocalStates();
      if (e.affectsConfiguration('editor.tokenColorCustomizations'))
        mrDiffPanelController.refreshTokenThemes();
      if (affectsEditorFont(e)) mrDiffPanelController.refreshEditorFonts();
      if (e.affectsConfiguration(JIRA_CONFIG_SECTION)) {
        mrDiffPanelController.refreshJiraLinks();
        await issuableController.refreshJiraLinks();
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => mrDiffPanelController.refreshTokenThemes()),
  );
  await accountService.init(context).catch(e => {
    handleError(e);
    throw e;
  });
  selectedProjectStore.init(context);
  registerCiCompletion(context);
  setupYamlSupport(context);
  setupCodeSuggestionsPromo(context);
  vscode.window.registerUriHandler(gitlabUriHandler);
  context.subscriptions.push(gitExtensionWrapper);

  statusBar.init();
  context.subscriptions.push(statusBar);

  currentBranchRefresher.init();
  context.subscriptions.push(currentBranchRefresher);
  context.subscriptions.push(jobLogContentProvider);

  vscode.window.registerFileDecorationProvider(hasCommentsDecorationProvider);
  vscode.window.registerFileDecorationProvider(changeTypeDecorationProvider);
  vscode.authentication.registerAuthenticationProvider(
    'gitlab',
    'GitLab.com Authentication',
    new GitLabAuthenticationProvider(),
  );

  registerSidebarTreeDataProviders();
  registerRepositoryRootProvider(
    issuableController,
    pendingWebviewController,
    securityFindingWebviewController,
    mrDiffPanelController,
  );
  await migrateCredentials(context, accountService).catch(e => handleError(e));

  const dependencyContainer = createDependencyContainer();
  await extensionState.init(accountService, dependencyContainer.gitLabPlatformManager);
  context.subscriptions.push(
    // fork-only: the current branch view lists Jira keys; it cannot refresh before extensionState
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration(JIRA_CONFIG_SECTION)) await currentBranchRefresher.refresh();
    }),
  );

  if (featureFlags.isEnabled(featureFlags.FeatureFlag.LanguageServer)) {
    await registerLanguageServer(
      context,
      desktopLanguageClientFactory,
      dependencyContainer.gitLabPlatformManager,
    );
  } else {
    const codeSuggestions = new CodeSuggestions(context, dependencyContainer.gitLabPlatformManager);
    await codeSuggestions.init();
    context.subscriptions.push(codeSuggestions);
  }

  // we don't want to hold the extension startup by waiting on VS Code and GitLab API
  doNotAwait(
    Promise.all([
      vscode.commands.executeCommand(USER_COMMANDS.VALIDATE_ACCOUNTS, true),
      setupVersionCheck(context),
      setSidebarViewState(SidebarViewState.ListView),
      gitExtensionWrapper.init(),
      gitlabProjectRepository.init(),
      currentBranchRefresher.refresh(),
      pendingWebviewController.init(context),
      securityFindingWebviewController.init(context),
      activateCommon(context, dependencyContainer, outputChannel),
    ]).catch(e => handleError(e)),
  );
};
