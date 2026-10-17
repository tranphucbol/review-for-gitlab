import * as vscode from 'vscode';
import { ErrorItem } from './items/error_item';
import { ItemModel } from './items/item_model';
import { MrItemModel } from './items/mr_item_model';
import { IssueItem } from './items/issue_item';
import { PipelineRootItemModel } from './items/pipeline_root_item_model';
import { isEnabled, FeatureFlag } from '../../common/feature_flags';

import {
  SecurityResultsItemModel,
  SecurityResultsType,
} from './items/security/security_results_item_model';

import {
  TreeState,
  BranchState,
  InvalidState,
  TagState,
  currentBranchRefresher,
} from '../current_branch_refresher';
import { onSidebarViewStateChange } from './sidebar_view_state';
import { DetachedHeadError } from '../errors/detached_head_error';
import { USER_COMMANDS } from '../command_names';
import { getTrackingBranchName } from '../git/get_tracking_branch_name';
import {
  MAX_JIRA_ITEMS,
  findJiraKeysFor,
  getJiraLinkConfig,
  jiraItemText,
} from '../jira/jira_keys';

export class CurrentBranchDataProvider
  implements vscode.TreeDataProvider<ItemModel | vscode.TreeItem>
{
  private eventEmitter = new vscode.EventEmitter<void>();

  onDidChangeTreeData = this.eventEmitter.event;

  private state: TreeState = { type: 'invalid' };

  private pipelineItem?: PipelineRootItemModel;

  private mrState?: { mr: RestMr; item: MrItemModel };

  constructor() {
    onSidebarViewStateChange(() => this.refresh(this.state), this);
    currentBranchRefresher.onStateChanged(e => this.refresh(e));
  }

  createPipelineItem(state: BranchState | TagState) {
    if (!state.pipeline) {
      return new vscode.TreeItem('No pipeline found');
    }
    this.pipelineItem = new PipelineRootItemModel(
      state.projectInRepository,
      state.pipeline,
      state.jobs,
      state.type === 'tag' ? 'Tag Pipeline' : 'Pipeline',
    );
    return this.pipelineItem;
  }

  disposeMrItem() {
    this.mrState?.item.dispose();
    this.mrState = undefined;
  }

  static getSecurityReportType(state: BranchState): SecurityResultsType {
    if (!state.mr || !state.securityFindings) {
      return 'NO_SCANS_FOUND';
    }
    if (state.securityFindings && state.pipeline?.status === 'running') {
      return 'RUNNING';
    }
    return 'COMPLETE';
  }

  static createSecurityFindingsItem(state: BranchState): ItemModel {
    return new SecurityResultsItemModel(
      state.projectInRepository,
      this.getSecurityReportType(state),
      state.securityFindings,
    );
  }

  createMrItem(state: BranchState): vscode.TreeItem | ItemModel {
    if (!state.userInitiated && this.mrState && this.mrState.mr.id === state.mr?.id)
      return this.mrState.item;
    this.disposeMrItem();
    if (!state.mr) return new vscode.TreeItem('No merge request found');
    const item = new MrItemModel(state.mr, state.projectInRepository);
    this.mrState = { mr: state.mr, item };
    return item;
  }

  // fork-only: Jira issues named by the branch and its merge request
  static async createJiraItems(state: BranchState): Promise<vscode.TreeItem[]> {
    const config = getJiraLinkConfig();
    if (!config) return [];
    const branch =
      state.mr?.source_branch ??
      (await getTrackingBranchName(state.projectInRepository.pointer.repository.rawRepository));
    return findJiraKeysFor(config, { branch, mr: state.mr })
      .slice(0, MAX_JIRA_ITEMS)
      .map(found => {
        const { label, description } = jiraItemText(found);
        const item = new vscode.TreeItem(label);
        item.description = description;
        item.iconPath = new vscode.ThemeIcon('link-external');
        item.command = {
          command: USER_COMMANDS.OPEN_JIRA_ISSUE,
          title: 'Open Jira Issue',
          arguments: [found.key],
        };
        return item;
      });
  }

  static createClosingIssueItems(rootFsPath: string, issues: RestIssuable[]) {
    if (issues.length === 0) return [new vscode.TreeItem('No closing issue found')];
    return issues.map(issue => new IssueItem(issue, rootFsPath));
  }

  static renderInvalidState(state: InvalidState): vscode.TreeItem[] {
    if (state.error) {
      if (state.error instanceof DetachedHeadError) {
        return [new ErrorItem(state.error.message)];
      }
      return [new ErrorItem()];
    }
    return [];
  }

  async getChildren(item: ItemModel | undefined): Promise<(ItemModel | vscode.TreeItem)[]> {
    if (item) return item.getChildren();
    this.pipelineItem?.dispose();
    this.pipelineItem = undefined;
    if (this.state.type === 'invalid') {
      this.disposeMrItem();
      return CurrentBranchDataProvider.renderInvalidState(this.state);
    }
    if (this.state.type === 'branch') {
      const mrItem = this.createMrItem(this.state);
      const pipelineItem = this.createPipelineItem(this.state);
      const jiraItems = await CurrentBranchDataProvider.createJiraItems(this.state);
      const closingIssuesItems = CurrentBranchDataProvider.createClosingIssueItems(
        this.state.projectInRepository.pointer.repository.rootFsPath,
        this.state.issues,
      );

      if (isEnabled(FeatureFlag.SecurityScans)) {
        const securityFindingsItem = CurrentBranchDataProvider.createSecurityFindingsItem(
          this.state,
        );
        return [pipelineItem, mrItem, ...jiraItems, ...closingIssuesItems, securityFindingsItem];
      }

      return [pipelineItem, mrItem, ...jiraItems, ...closingIssuesItems];
    }
    if (this.state.type === 'tag') {
      this.disposeMrItem();
      const pipelineItem = this.createPipelineItem(this.state);
      return [pipelineItem];
    }
    throw new Error('Unknown head ref state type');
  }

  // eslint-disable-next-line class-methods-use-this
  getTreeItem(item: ItemModel | vscode.TreeItem) {
    if (item instanceof ItemModel) return item.getTreeItem();
    return item;
  }

  refresh(state: TreeState) {
    this.state = state;
    this.eventEmitter.fire();
  }
}

export const currentBranchDataProvider = new CurrentBranchDataProvider();
