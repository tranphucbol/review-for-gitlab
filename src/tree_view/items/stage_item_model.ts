import * as vscode from 'vscode';
import { getJobMetadata } from '../../gitlab/ci_status_metadata';
import { compareBy } from '../../utils/compare_by';
import { JobItemModel } from './job_item_model';
import { ItemModel } from './item_model';
import { hasDownloadableArtifacts, JobProvider } from './job_provider';

const first = <T>(a: T[]): T | undefined => a[0];

export class StageItemModel extends ItemModel implements JobProvider {
  constructor(private stageName: string, private jobs: RestJob[]) {
    super();
  }

  getJobs(): RestJob[] {
    return this.jobs;
  }

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.stageName, vscode.TreeItemCollapsibleState.Expanded);
    const mostSevereStatusMetadata = first(
      this.jobs.map(getJobMetadata).sort(compareBy('priority')).reverse(),
    );
    item.iconPath = mostSevereStatusMetadata?.icon;
    item.tooltip = mostSevereStatusMetadata?.name;
    if (hasDownloadableArtifacts(this.getJobs())) {
      item.contextValue = 'with-artifacts';
    }
    return item;
  }

  async getChildren(): Promise<vscode.TreeItem[] | ItemModel[]> {
    return this.jobs.map(j => new JobItemModel(j));
  }
}
