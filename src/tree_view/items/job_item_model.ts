import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getJobMetadata } from '../../gitlab/ci_status_metadata';
import { ItemModel } from './item_model';
import { openInBrowserCommand } from '../../utils/open_in_browser_command';
import { hasDownloadableArtifacts, JobProvider } from './job_provider';

dayjs.extend(relativeTime);

export class JobItemModel extends ItemModel implements JobProvider {
  constructor(private job: RestJob) {
    super();
  }

  getJobs(): RestJob[] {
    return [this.job];
  }

  getTreeItem(): vscode.TreeItem {
    const { job } = this;
    const item = new vscode.TreeItem(job.name);
    const jobStatusMetadata = getJobMetadata(job);
    const displayTime = job.finished_at ?? job.started_at ?? job.created_at;
    item.iconPath = jobStatusMetadata.icon;
    item.tooltip = `${job.name} · ${jobStatusMetadata.name} · ${dayjs(displayTime).fromNow()}`;
    item.description = jobStatusMetadata.name;
    item.command = openInBrowserCommand(job.web_url);
    if (hasDownloadableArtifacts(this.getJobs())) {
      item.contextValue = 'with-artifacts';
    }
    return item;
  }

  // eslint-disable-next-line class-methods-use-this
  async getChildren(): Promise<ItemModel[]> {
    return [];
  }
}
