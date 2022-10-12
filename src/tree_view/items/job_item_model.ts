import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getJobMetadata } from '../../gitlab/ci_status_metadata';
import { ItemModel } from './item_model';
import { openInBrowserCommand } from '../../utils/open_in_browser_command';
import { JobProvider } from './job_provider';
import { ProjectInRepository } from '../../gitlab/new_project';
import { hasDownloadableArtifacts } from '../../utils/has_downloadable_artifacts';

dayjs.extend(relativeTime);

const getJobItemContextValue = (job: RestJob) => {
  if (job.stage === 'external') {
    return '';
  }

  const contextValue: string[] = [];

  const { contextAction } = getJobMetadata(job);
  if (contextAction) {
    contextValue.push(`${contextAction}-job`);
  }
  if (hasDownloadableArtifacts([job])) {
    contextValue.push('with-artifacts');
  }
  if (job.finished_at) {
    contextValue.push('with-trace');
  }
  return contextValue.join(',');
};

export class JobItemModel extends ItemModel implements JobProvider {
  constructor(public projectInRepository: ProjectInRepository, public job: RestJob) {
    super();
  }

  get jobs(): RestJob[] {
    return [this.job];
  }

  getTreeItem(): vscode.TreeItem {
    const { job } = this;
    const item = new vscode.TreeItem(job.name);
    const jobStatusMetadata = getJobMetadata(job);
    const displayTime = job.finished_at ?? job.started_at ?? job.created_at;
    item.iconPath = jobStatusMetadata.icon;
    item.tooltip = `${job.name} · ${jobStatusMetadata.name} · ${dayjs(displayTime).fromNow()}`;
    if (job.description) item.tooltip += `\n${job.description}`;
    item.description = jobStatusMetadata.name;
    if (job.web_url) item.command = openInBrowserCommand(job.web_url);
    else if (job.target_url) item.command = openInBrowserCommand(job.target_url);
    item.contextValue = getJobItemContextValue(job);
    return item;
  }

  // eslint-disable-next-line class-methods-use-this
  async getChildren(): Promise<ItemModel[]> {
    return [];
  }
}
