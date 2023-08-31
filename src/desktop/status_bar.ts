import * as vscode from 'vscode';
import assert = require('assert');
import * as openers from './commands/openers';
import { PROGRAMMATIC_COMMANDS, USER_COMMANDS } from './command_names';
import { currentBranchRefresher, TreeState } from './current_branch_refresher';
import { ProjectInRepository } from './gitlab/new_project';
import { createStatusBarItem } from '../common/utils/status_bar_item';

// FIXME: if you are touching this configuration statement, move the configuration to extension_configuration.ts
const {
  showStatusBarLinks,
  showIssueLinkOnStatusBar,
  showMrStatusOnStatusBar,
  showPipelineUpdateNotifications,
} = vscode.workspace.getConfiguration('gitlab');

const iconForStatus: Record<string, { icon: string; text?: string } | undefined> = {
  running: { icon: 'pulse' },
  pending: { icon: 'clock' },
  success: { icon: 'check', text: 'passed' },
  failed: { icon: 'x' },
  canceled: { icon: 'circle-slash' },
  skipped: { icon: 'diff-renamed' },
};

const getStatusText = (status: string) => iconForStatus[status]?.text || status;

const openIssuableInWebview = (issuable: RestIssuable, rootFsPath: string): vscode.Command => ({
  title: '',
  command: PROGRAMMATIC_COMMANDS.SHOW_RICH_CONTENT,
  arguments: [issuable, rootFsPath],
});

export class StatusBar {
  pipelineStatusBarItem?: vscode.StatusBarItem;

  mrStatusBarItem?: vscode.StatusBarItem;

  mrIssueStatusBarItem?: vscode.StatusBarItem;

  #refreshSubscription?: vscode.Disposable;

  firstRun = true;

  async refresh(state: TreeState) {
    if (state.type === 'branch') {
      const { rootFsPath } = state.projectInRepository.pointer.repository;
      await this.updatePipelineItem(state.pipeline, state.jobs, state.projectInRepository);
      this.updateMrItem(state.mr, rootFsPath);
      this.fetchMrClosingIssue(state.mr, state.issues, rootFsPath);
    } else if (state.type === 'tag') {
      await this.updatePipelineItem(state.pipeline, state.jobs, state.projectInRepository);
      this.mrStatusBarItem?.hide();
      this.mrIssueStatusBarItem?.hide();
    } else {
      this.hideAllItems();
    }
  }

  hideAllItems(): void {
    this.pipelineStatusBarItem?.hide();
    this.mrStatusBarItem?.hide();
    this.mrIssueStatusBarItem?.hide();
  }

  async updatePipelineItem(
    pipeline: RestPipeline | undefined,
    jobs: RestJob[],
    projectInRepository: ProjectInRepository,
  ): Promise<void> {
    if (!this.pipelineStatusBarItem) return;
    if (!pipeline) {
      this.pipelineStatusBarItem.text = 'No pipeline';
      this.pipelineStatusBarItem.show();
      this.firstRun = false;
      return;
    }
    const { status } = pipeline;
    const statusText = getStatusText(status);

    const msg = `$(${iconForStatus[status]?.icon}) Pipeline ${statusText}`;

    if (
      showPipelineUpdateNotifications &&
      this.pipelineStatusBarItem.text !== msg &&
      !this.firstRun
    ) {
      const message = `Pipeline ${statusText}`;

      await vscode.window
        .showInformationMessage(message, { modal: false }, 'View in Gitlab')
        .then(async selection => {
          if (selection === 'View in Gitlab') {
            await openers.openCurrentPipeline(projectInRepository);
          }
        });
    }

    this.pipelineStatusBarItem.text = msg;
    this.pipelineStatusBarItem.show();
    this.firstRun = false;
  }

  fetchMrClosingIssue(
    mr: RestMr | undefined,
    closingIssues: RestIssuable[],
    rootFsPath: string,
  ): void {
    if (!this.mrIssueStatusBarItem) return;
    if (mr) {
      let text = `$(code) No issue`;
      let command;

      const firstIssue = closingIssues[0];
      if (firstIssue) {
        text = `$(code) #${firstIssue.iid}`;
        command = openIssuableInWebview(firstIssue, rootFsPath);
      }

      this.mrIssueStatusBarItem.text = text;
      this.mrIssueStatusBarItem.command = command;
      this.mrIssueStatusBarItem.show();
    } else {
      this.mrIssueStatusBarItem.hide();
    }
  }

  updateMrItem(mr: RestMr | undefined, rootFsPath: string): void {
    if (!this.mrStatusBarItem) return;
    this.mrStatusBarItem.show();
    this.mrStatusBarItem.command = mr
      ? openIssuableInWebview(mr, rootFsPath)
      : USER_COMMANDS.OPEN_CREATE_NEW_MR;
    this.mrStatusBarItem.text = mr
      ? `$(git-pull-request) !${mr.iid}`
      : '$(git-pull-request) Create MR';
  }

  init(): void {
    assert(!this.pipelineStatusBarItem, 'The status bar is already initialized');
    if (showStatusBarLinks) {
      this.#refreshSubscription = currentBranchRefresher.onStateChanged(e => this.refresh(e));
      this.pipelineStatusBarItem = createStatusBarItem({
        priority: 2,
        id: 'gl.status.pipeline',
        name: 'GitLab Workflow: Pipeline',
        initialText: '$(info) Fetching pipeline...',
        command: USER_COMMANDS.PIPELINE_ACTIONS,
      });
      if (showMrStatusOnStatusBar) {
        this.mrStatusBarItem = createStatusBarItem({
          priority: 1,
          id: 'gl.status.mr',
          name: 'GitLab Workflow: Merge Request',
          initialText: '$(info) Finding MR...',
        });
        if (showIssueLinkOnStatusBar) {
          this.mrIssueStatusBarItem = createStatusBarItem({
            priority: 0,
            id: 'gl.status.issue',
            name: 'GitLab Workflow: Issue',
            initialText: '$(info) Fetching closing issue...',
          });
        }
      }
    }
  }

  dispose(): void {
    if (showStatusBarLinks) {
      this.#refreshSubscription?.dispose();
      this.pipelineStatusBarItem?.dispose();

      if (showIssueLinkOnStatusBar) {
        this.mrIssueStatusBarItem?.dispose();
      }
      if (showMrStatusOnStatusBar) {
        this.mrStatusBarItem?.dispose();
      }
    }
  }
}

export const statusBar = new StatusBar();
