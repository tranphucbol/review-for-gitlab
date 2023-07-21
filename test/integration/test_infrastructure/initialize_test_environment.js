const vscode = require('vscode');
const { USER_COMMANDS } = require('../../../src/desktop/command_names');
const { extensionState } = require('../../../src/desktop/extension_state');
const { gitExtensionWrapper } = require('../../../src/desktop/git/git_extension_wrapper');
const {
  gitlabProjectRepository,
} = require('../../../src/desktop/gitlab/gitlab_project_repository');
const { selectedProjectStore } = require('../../../src/desktop/gitlab/selected_project_store');
const { accountService } = require('../../../src/desktop/accounts/account_service');
const { issuableController } = require('../../../src/desktop/issuable_controller');
const { GITLAB_URL } = require('./constants');
const { InMemoryMemento } = require('./in_memory_memento');
const { getServer } = require('./mock_server');
const {
  registerRepositoryRootProvider,
} = require('../../../src/desktop/commands/run_with_valid_project');
const {
  pendingWebviewController,
} = require('../../../src/desktop/ci/pending_job_webview_controller');

const rejectAfter = (reason, durationInMs) =>
  new Promise((res, rej) => {
    setTimeout(() => rej(new Error(reason)), durationInMs);
  });

const ensureProject = async () => {
  await gitExtensionWrapper.init();
  await gitlabProjectRepository.init();
  const projects = gitlabProjectRepository.getDefaultAndSelectedProjects();
  if (projects.length > 0) return undefined;
  const createPromiseThatResolvesWhenRepoCountChanges = () =>
    new Promise(resolve => {
      const sub = gitlabProjectRepository.onProjectChange(() => {
        sub.dispose();
        resolve(undefined);
      });
    });
  return createPromiseThatResolvesWhenRepoCountChanges();
};

const initializeTestEnvironment = async testRoot => {
  accountService.init({ globalState: new InMemoryMemento() });
  process.env.GITLAB_WORKFLOW_INSTANCE_URL = GITLAB_URL;
  process.env.GITLAB_WORKFLOW_TOKEN = 'abcd-secret';
  extensionState.init(accountService);
  registerRepositoryRootProvider(issuableController, pendingWebviewController);
  pendingWebviewController.init({ extensionPath: `${testRoot}/../..` });
  issuableController.init({ extensionPath: `${testRoot}/../..` });
  selectedProjectStore.init({ globalState: new InMemoryMemento() });
  const ext = vscode.extensions.getExtension('gitlab.gitlab-workflow');
  // run the extension activation and project load with a mock server
  const server = getServer();
  await ext.activate();
  await Promise.race([ensureProject(), rejectAfter('No project after 5s', 5000)]);
  await vscode.commands.executeCommand(USER_COMMANDS.REFRESH_SIDEBAR);
  server.close();
};

module.exports = { initializeTestEnvironment };
