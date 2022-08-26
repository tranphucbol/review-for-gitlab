import * as vscode from 'vscode';
import { VS_COMMANDS } from '../command_names';
import { isArtifactDownloadable, JobProvider } from '../tree_view/items/job_provider';

const first = <T>(a: T[]): T | undefined => a[0];

interface ArtifactPickItem extends vscode.QuickPickItem {
  job: RestJob;
  artifact: RestArtifact;
}

export async function downloadArtifacts(item: JobProvider): Promise<void> {
  let result: ArtifactPickItem | undefined;

  const jobs = item.getJobs();
  const singleJob = jobs.length === 1 ? first(jobs) : null;
  const artifacts = jobs.flatMap(
    j => j.artifacts?.filter(isArtifactDownloadable).map(a => ({ artifact: a, job: j })) ?? [],
  );

  if (!artifacts.length) {
    await vscode.window.showWarningMessage('This job does not have downloadable artifacts.');
    return;
  }

  const items: ArtifactPickItem[] = artifacts.map(a => ({
    label: `$(${a.artifact.file_type === 'archive' ? 'file-zip' : 'file'}) ${
      singleJob ? '' : `${a.job.name}:`
    }${a.artifact.file_type}`,
    description: a.artifact.filename,
    job: a.job,
    artifact: a.artifact,
  }));

  if (singleJob && items.length === 1 && items[0].artifact.file_type === 'archive') {
    result = first(items);
  } else {
    result = await vscode.window.showQuickPick(items, {
      title: 'Download artifacts',
    });
  }

  if (!result) return;

  const uri = `${result.job.web_url}/artifacts/download?file_type=${result.artifact.file_type}`;
  await vscode.commands.executeCommand(VS_COMMANDS.OPEN, vscode.Uri.parse(uri));
}
