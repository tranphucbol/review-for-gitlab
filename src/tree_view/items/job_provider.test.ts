import { hasDownloadableArtifacts, isArtifactDownloadable } from './job_provider';
import { job, artifact } from '../../test_utils/entities';

const traceArtifact = { ...artifact, file_type: 'trace' };
const metadataArtifact = { ...artifact, file_type: 'metadata' };
const junitArtifact = { ...artifact, file_type: 'junit' };

describe('isArtifactDownloadable', () => {
  it('return false for trace artifacts', () => {
    expect(isArtifactDownloadable(traceArtifact)).toBe(false);
  });

  it('returns true for junit artifacts', () => {
    expect(isArtifactDownloadable(junitArtifact)).toBe(true);
  });
});

describe('hasDownloadableArtifacts', () => {
  const traceJob = { ...job, artifacts: [traceArtifact, metadataArtifact] };
  const junitJob = { ...job, artifacts: [traceArtifact, metadataArtifact, junitArtifact] };

  it('returns false for empty arrays', () => {
    expect(hasDownloadableArtifacts([])).toBe(false);
  });
  it('returns false for trace and metadata artifacts', () => {
    expect(hasDownloadableArtifacts([traceJob])).toBe(false);
  });
  it('returns true for junit artifacts', () => {
    expect(hasDownloadableArtifacts([traceJob, junitJob])).toBe(true);
  });
});
