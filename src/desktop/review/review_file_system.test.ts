import { ReviewFileSystem } from './review_file_system';
import { ReviewParams, toReviewUri } from './review_uri';
import { getFileContent } from '../git/get_file_content';
import { asMock } from '../test_utils/as_mock';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { projectInRepository } from '../test_utils/entities';
import { getGitLabService } from '../gitlab/get_gitlab_service';

jest.mock('../gitlab/get_gitlab_service');
jest.mock('../git/get_file_content');
jest.mock('../gitlab/gitlab_project_repository');

describe('ReviewFileSystem', () => {
  const fileSystem = new ReviewFileSystem();

  const reviewUriParams: ReviewParams = {
    commit: 'abcdef',
    path: '/review',
    exists: true,
    projectId: 1234,
    mrId: 2345,
    repositoryRoot: 'path/to/workspace',
  };

  beforeEach(() => {
    asMock(gitlabProjectRepository.getProjectOrFail).mockReturnValue(projectInRepository);
  });

  it('provides file content from a git repository', async () => {
    asMock(getFileContent).mockReturnValue('Test text');

    const result = await fileSystem.readFile(toReviewUri(reviewUriParams));
    expect(result.toString()).toBe('Test text');
  });

  it('falls back to the API provider if file does not exist in the git repository', async () => {
    asMock(getFileContent).mockReturnValue(null);

    asMock(getGitLabService).mockReturnValue({
      getFileContent: () => Promise.resolve(Buffer.from('Api content')),
    });

    const result = await fileSystem.readFile(toReviewUri(reviewUriParams));
    expect(result.toString()).toBe('Api content');
  });
});
