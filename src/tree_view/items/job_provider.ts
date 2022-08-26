export function isArtifactDownloadable(artifact: RestArtifact) {
  return artifact.file_type !== 'trace' && artifact.file_type !== 'metadata';
}

export function hasDownloadableArtifacts(jobs: RestJob[]): boolean {
  return !!jobs.find(j => j.artifacts?.find(isArtifactDownloadable));
}

export interface JobProvider {
  getJobs(): RestJob[];
}
