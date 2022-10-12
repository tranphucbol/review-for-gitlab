import { promises as fs } from 'fs';
import * as path from 'path';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { GitLabService } from '../gitlab/gitlab_service';
import { asMock } from '../test_utils/as_mock';
import { toJobLogUri } from './job_log_uri';

import { JobLogContentProvider } from './job_log_content_provider';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { projectInRepository } from '../test_utils/entities';
import { jobLogCache } from './job_log_cache';

jest.mock('../gitlab/get_gitlab_service');
jest.mock('../gitlab/gitlab_project_repository');

describe('JobLogContentProvider', () => {
  const uri = toJobLogUri('/repo', 123);

  beforeEach(async () => {
    const rawTrace = await fs.readFile(
      path.join(__dirname, '..', 'test_utils', 'raw_trace.log'),
      'utf-8',
    );

    const gitlabService: Partial<GitLabService> = {
      async getJobTrace(): Promise<string> {
        return rawTrace;
      },
    };
    asMock(getGitLabService).mockReturnValue(gitlabService);
    asMock(gitlabProjectRepository.getProjectOrFail).mockReturnValue(projectInRepository);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jobLogCache.clearAll();
  });

  it('filters escape sequences', async () => {
    const filteredTrace = await fs.readFile(
      path.join(__dirname, '..', 'test_utils', 'filtered_trace.log'),
      'utf-8',
    );
    const provider = new JobLogContentProvider();
    const filtered = await provider.provideTextDocumentContent(uri);
    expect(filtered).toBe(filteredTrace);
  });

  it('sets cache items', async () => {
    await new JobLogContentProvider().provideTextDocumentContent(uri);

    const item = jobLogCache.get(123);
    expect(item?.sections).toBeDefined();
    expect(item?.decorations).toBeDefined();
  });
});
