import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getPipelineMetadata } from '../../gitlab/ci_status_metadata';
import { openInBrowserCommand } from '../../utils/open_in_browser_command';
import { ItemModel } from './item_model';
import { StageItemModel } from './stage_item_model';
import { compareBy } from '../../utils/compare_by';
import { hasDownloadableArtifacts, JobProvider } from './job_provider';
import { ProjectInRepository } from '../../gitlab/new_project';

dayjs.extend(relativeTime);
/** removes duplicates based on === equality. Can be replaced with lodash. */
const uniq = <T>(duplicated: T[]): T[] => [...new Set(duplicated)];

const getUniqueStages = (jobs: RestJob[]): string[] => uniq(jobs.map(j => j.stage));

export class PipelineItemModel extends ItemModel implements JobProvider {
  constructor(
    private projectInRepository: ProjectInRepository,
    private pipeline: RestPipeline,
    private jobs: RestJob[],
  ) {
    super();
  }

  getJobs(): RestJob[] {
    return this.jobs;
  }

  getTreeItem(): vscode.TreeItem {
    const timeAgo = dayjs(this.pipeline.updated_at).fromNow();
    const label = `Pipeline #${this.pipeline.id}`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    const statusMetadata = getPipelineMetadata(this.pipeline);
    item.tooltip = `${label} · ${statusMetadata.name} · ${timeAgo}`;
    item.description = statusMetadata.name;
    item.iconPath = statusMetadata.icon;
    item.command = openInBrowserCommand(this.pipeline.web_url);
    if (hasDownloadableArtifacts(this.getJobs())) {
      item.contextValue = 'with-artifacts';
    }
    return item;
  }

  async getChildren(): Promise<ItemModel[]> {
    const jobsAsc = this.jobs.sort(compareBy('id'));
    const stages = getUniqueStages(jobsAsc);
    const stagesWithJobs = stages.map(stageName => ({
      name: stageName,
      jobs: jobsAsc.filter(j => j.stage === stageName),
    }));
    return stagesWithJobs.map(sj => new StageItemModel(this.projectInRepository, sj.name, sj.jobs));
  }
}
