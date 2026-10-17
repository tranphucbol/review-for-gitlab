import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import { getTrackingBranchName } from '../git/get_tracking_branch_name';
import { BranchState, TagState } from '../current_branch_refresher';
import {
  mr,
  pipeline,
  job,
  issue,
  projectInRepository,
  securityReport,
} from '../test_utils/entities';
import { CurrentBranchDataProvider } from './current_branch_data_provider';
import { ItemModel } from './items/item_model';
import { PipelineItemModel } from './items/pipeline_item_model';
import { asMock } from '../test_utils/as_mock';
import { getExtensionConfiguration } from '../../common/utils/extension_configuration';
import { FeatureFlag, isEnabled } from '../../common/feature_flags';

jest.mock('./items/mr_item_model');
jest.mock('./items/pipeline_item_model');
jest.mock('../../common/utils/extension_configuration');
jest.mock('../../common/feature_flags');
jest.mock('../git/get_tracking_branch_name');

const isItemModel = (object: any): object is ItemModel => typeof object.dispose === 'function';
const branchState: BranchState = {
  type: 'branch',
  mr,
  pipeline,
  jobs: [job],
  issues: [issue],
  projectInRepository,
  userInitiated: true,
};

const tagState: TagState = {
  type: 'tag',
  pipeline,
  jobs: [job],
  projectInRepository,
  userInitiated: true,
};

describe('CurrentBranchDataProvider', () => {
  let currentBranchProvider: CurrentBranchDataProvider;
  let pipelineItem: Disposable;
  let mrItem: Disposable;

  beforeEach(async () => {
    asMock(getExtensionConfiguration).mockReturnValue({ featureFlags: {} });
    currentBranchProvider = new CurrentBranchDataProvider();
    await currentBranchProvider.refresh(branchState);
    [pipelineItem, mrItem] = (await currentBranchProvider.getChildren(undefined)).filter(
      isItemModel,
    );
  });

  describe('disposing items', () => {
    it('dispose is not called before refresh', () => {
      expect(pipelineItem.dispose).not.toHaveBeenCalled();
      expect(mrItem.dispose).not.toHaveBeenCalled();
    });

    it('disposes previous items when we render valid state', async () => {
      await currentBranchProvider.getChildren(undefined);
      expect(pipelineItem.dispose).toHaveBeenCalled();
      expect(mrItem.dispose).toHaveBeenCalled();
    });

    it('disposes previous branch items when we render tag state', async () => {
      currentBranchProvider.refresh(tagState);
      await currentBranchProvider.getChildren(undefined);
      expect(pipelineItem.dispose).toHaveBeenCalled();
      expect(mrItem.dispose).toHaveBeenCalled();
    });

    it('disposes previous items when we render invalid state', async () => {
      currentBranchProvider.refresh({ type: 'invalid' });
      await currentBranchProvider.getChildren(undefined);
      expect(pipelineItem.dispose).toHaveBeenCalled();
      expect(mrItem.dispose).toHaveBeenCalled();
    });

    it('does not dispose mr item if the refresh is not user initiated', async () => {
      currentBranchProvider.refresh({ ...branchState, userInitiated: false });
      await currentBranchProvider.getChildren(undefined);
      expect(mrItem.dispose).not.toHaveBeenCalled();
    });

    it('reuses the same mr item if the refresh was not user initiated', async () => {
      currentBranchProvider.refresh({ ...branchState, userInitiated: false });
      const [, newMrItem] = await currentBranchProvider.getChildren(undefined);
      expect(newMrItem).toBe(mrItem);
    });
  });

  describe('MR Item', () => {
    it('reuses the same mr item if the refresh was not user initiated', async () => {
      currentBranchProvider.refresh({ ...branchState, userInitiated: false });
      const [, newMrItem] = await currentBranchProvider.getChildren(undefined);
      expect(newMrItem).toBe(mrItem);
    });

    it('renders new MR item if the user initiated the refresh', async () => {
      currentBranchProvider.refresh({ ...branchState, userInitiated: true });
      const [, newMrItem] = await currentBranchProvider.getChildren(undefined);
      expect(newMrItem).not.toBe(mrItem);
    });

    it('if the MR is different, even automatic (not user initiated) refresh triggers rerender', async () => {
      currentBranchProvider.refresh({
        ...branchState,
        mr: { ...mr, id: 99999 },
        userInitiated: false,
      });
      const [, newMrItem] = await currentBranchProvider.getChildren(undefined);
      expect(newMrItem).not.toBe(mrItem);
    });
  });

  describe('Security findings item', () => {
    describe('security scans flag off', () => {
      beforeEach(() => {
        jest.mocked(isEnabled).mockImplementation(feature => feature !== FeatureFlag.SecurityScans);
      });

      it('does not render item', async () => {
        currentBranchProvider.refresh({
          ...branchState,
          pipeline: { ...pipeline, status: 'running' },
        });

        const [, , , securityItem] = await currentBranchProvider.getChildren(undefined);
        expect(securityItem as ItemModel).toBe(undefined);
      });
    });
    describe('security scans flag on', () => {
      beforeEach(() => {
        jest.mocked(isEnabled).mockImplementation(feature => feature === FeatureFlag.SecurityScans);
      });

      it('renders no scans found', async () => {
        currentBranchProvider.refresh({
          ...branchState,
          pipeline: { ...pipeline, status: 'running' },
          mr: undefined,
          securityFindings: securityReport,
        });

        const [, , , securityItem] = await currentBranchProvider.getChildren(undefined);
        expect((securityItem as ItemModel).getTreeItem().label).toBe('No security scans found');
      });

      it('renders scanning state', async () => {
        currentBranchProvider.refresh({
          ...branchState,
          pipeline: { ...pipeline, status: 'running' },
          securityFindings: securityReport,
        });

        const [, , , securityItem] = await currentBranchProvider.getChildren(undefined);
        expect((securityItem as ItemModel).getTreeItem().label).toBe('Security scanning');
      });

      it('renders complete state', async () => {
        currentBranchProvider.refresh({
          ...branchState,
          pipeline: { ...pipeline, status: 'success' },
          securityFindings: securityReport,
        });

        const [, , , securityItem] = await currentBranchProvider.getChildren(undefined);
        expect((securityItem as ItemModel).getTreeItem().label).toBe('Security scanning');
      });
    });
  });

  describe('Jira items', () => {
    const mockJiraUrl = (url?: string) =>
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue({ url } as unknown as vscode.WorkspaceConfiguration);
    const labels = (items: (ItemModel | vscode.TreeItem)[]) =>
      items.map(i => (i instanceof vscode.TreeItem ? i.label : undefined));

    beforeEach(() => mockJiraUrl('https://jira.example.com'));
    afterEach(() => mockJiraUrl(undefined));

    it('lists up to three keys of the branch and merge request after the merge request', async () => {
      currentBranchProvider.refresh({
        ...branchState,
        mr: { ...mr, source_branch: 'feature/PC-1-x', title: 'PC-2 PC-3 PC-4' },
      });

      const children = await currentBranchProvider.getChildren(undefined);

      expect(labels(children).slice(2, 6)).toEqual([
        'Jira: PC-1',
        'Jira: PC-2',
        'Jira: PC-3',
        '#1000 · Issuable Title',
      ]);
      const item = children[2] as vscode.TreeItem;
      expect(item.command).toEqual({
        command: 'gl.openJiraIssue',
        title: 'Open Jira Issue',
        arguments: ['PC-1'],
      });
    });

    it('reads the branch name when there is no merge request', async () => {
      asMock(getTrackingBranchName).mockResolvedValue('PE-7-fix');
      currentBranchProvider.refresh({ ...branchState, mr: undefined });

      const children = await currentBranchProvider.getChildren(undefined);

      expect(labels(children)).toContain('Jira: PE-7');
    });

    it('lists nothing when Jira links are off', async () => {
      mockJiraUrl(undefined);
      currentBranchProvider.refresh({
        ...branchState,
        mr: { ...mr, source_branch: 'feature/PC-1-x' },
      });

      const children = await currentBranchProvider.getChildren(undefined);

      expect(labels(children).some(l => String(l).startsWith('Jira:'))).toBe(false);
    });
  });

  describe('Pipeline item', () => {
    it.each([tagState, branchState])('renders pipeline item for $type state', async state => {
      currentBranchProvider.refresh(state);
      const [pipelineItemModel] = await currentBranchProvider.getChildren(undefined);
      expect(pipelineItemModel).toBeInstanceOf(PipelineItemModel);
    });
  });
});
