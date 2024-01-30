import * as vscode from 'vscode';
import { ItemModel } from './item_model';
import { ProjectInRepository } from '../../gitlab/new_project';
import { PipelineItemModel } from './pipeline_item_model';
import { getPipelineMetadata } from '../../gitlab/ci_status_metadata';
import { compareBy } from '../../../common/utils/compare_by';
import { notNullOrUndefined } from '../../utils/not_null_or_undefined';

export class DownstreamPipelinesItemModel extends ItemModel {
  projectInRepository: ProjectInRepository;

  bridgeJobs: RestBridge[];

  constructor(projectInRepository: ProjectInRepository, bridgeJobs: RestBridge[]) {
    super();
    this.projectInRepository = projectInRepository;
    this.bridgeJobs = bridgeJobs;
  }

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(
      'Downstream pipelines',
      vscode.TreeItemCollapsibleState.Expanded,
    );
    const [mostSevereStatusMetadata] = this.bridgeJobs
      .map(j => j.downstream_pipeline)
      .filter(notNullOrUndefined)
      .map(p => getPipelineMetadata(p))
      .sort(compareBy('priority'))
      .reverse();
    item.iconPath = mostSevereStatusMetadata?.icon;
    if (mostSevereStatusMetadata?.name) {
      item.tooltip = `${item.label} · ${mostSevereStatusMetadata.name}`;
    }
    return item;
  }

  async getChildren(): Promise<ItemModel[]> {
    return this.bridgeJobs.map(
      job => new PipelineItemModel(this.projectInRepository, job.downstream_pipeline, [], job.name),
    );
  }
}
