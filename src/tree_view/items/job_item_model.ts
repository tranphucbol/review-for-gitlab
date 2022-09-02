import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getJobMetadata } from '../../gitlab/ci_status_metadata';
import { ItemModel } from './item_model';
import { openInBrowserCommand } from '../../utils/open_in_browser_command';
import { hasDownloadableArtifacts, JobProvider } from './job_provider';
import { ProjectInRepository } from '../../gitlab/new_project';

dayjs.extend(relativeTime);

const getJobItemContextValue = (job: RestJob) => {
  const { contextAction } = getJobMetadata(job);
  const actionValue = contextAction && `${contextAction}-job`;
  const artifactsValue = hasDownloadableArtifacts([job]) ? 'with-artifacts' : '';
  return `${actionValue},${artifactsValue}`;
};

export class JobItemModel extends ItemModel implements JobProvider {
  constructor(public projectInRepository: ProjectInRepository, public job: RestJob) {
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
    item.contextValue = getJobItemContextValue(job);
    return item;
  }

  // eslint-disable-next-line class-methods-use-this
  async getChildren(): Promise<ItemModel[]> {
    return [];
  }
}
