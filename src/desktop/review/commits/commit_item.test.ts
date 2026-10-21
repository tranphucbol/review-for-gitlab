import { handleError } from '../../../common/errors/handle_error';
import { USER_COMMANDS } from '../../command_names';
import { FetchError } from '../../errors/fetch_error';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { asMock } from '../../test_utils/as_mock';
import { diffFile, mr, mrVersion, projectInRepository } from '../../test_utils/entities';
import { ChangedFileItem } from '../../tree_view/items/changed_file_item';
import { setSidebarViewState, SidebarViewState } from '../../tree_view/sidebar_view_state';
import { fromReviewUri } from '../review_uri';
import { CommitItem } from './commit_item';
import { CommitsItem, createCommitsItem } from './commits_item';
import { CommitThreads } from './commit_threads';
import { clearCommitVersionsForTests } from './commit_versions';

jest.mock('../../gitlab/get_gitlab_service');
jest.mock('../../../common/errors/handle_error');

const restCommit: RestCommit = {
  id: 'c0ffee0123456789',
  short_id: 'c0ffee01',
  title: 'Fix the thing',
  message: 'Fix the thing\n\nLonger explanation.',
  author_name: 'Jane Doe',
  authored_date: '2026-10-01T10:00:00.000Z',
  created_at: '2026-10-01T10:00:00.000Z',
};

const notFound = () => new FetchError({ status: 404 } as Response, 'commit');

describe('commit items', () => {
  let service: Record<string, jest.Mock>;
  let commitThreads: CommitThreads;

  const context = () => ({ mr, mrVersion, projectInRepository, commitThreads });

  beforeEach(async () => {
    clearCommitVersionsForTests();
    await setSidebarViewState(SidebarViewState.ListView);
    service = {
      getCommit: jest.fn().mockResolvedValue({ ...restCommit, parent_ids: ['parent1'] }),
      getCommitDiff: jest.fn().mockResolvedValue([diffFile]),
      getMrCommits: jest.fn().mockResolvedValue([restCommit]),
    };
    asMock(getGitLabService).mockReturnValue(service);
    commitThreads = {
      addThreadsFor: jest.fn(),
      hasComments: () => false,
    } as unknown as CommitThreads;
  });

  describe('createCommitsItem', () => {
    it('uses the commits of the version without a request', async () => {
      const [item] = await createCommitsItem({
        ...context(),
        mrVersion: { ...mrVersion, commits: [restCommit, restCommit] },
      });

      expect(item.label).toBe('Commits (2)');
      expect(service.getMrCommits).not.toHaveBeenCalled();
      expect(item.getChildren()).toHaveLength(2);
    });

    it('asks for the commits when the version lacks them', async () => {
      const [item] = await createCommitsItem(context());

      expect(item).toBeInstanceOf(CommitsItem);
      expect(service.getMrCommits).toHaveBeenCalledWith(mr);
    });

    it('leaves the node out on a 404, quietly', async () => {
      service.getMrCommits.mockRejectedValue(notFound());

      expect(await createCommitsItem(context())).toEqual([]);
      expect(handleError).not.toHaveBeenCalled();
    });

    it('reports any other failure', async () => {
      const error = new FetchError({ status: 401 } as Response, 'MR commits');
      service.getMrCommits.mockRejectedValue(error);

      expect(await createCommitsItem(context())).toEqual([]);
      expect(handleError).toHaveBeenCalledWith(error);
    });
  });

  describe('CommitItem', () => {
    it('shows the title, short SHA and author, and opens the commit inside the merge request', () => {
      const item = new CommitItem(restCommit, context());

      expect(item.label).toBe('Fix the thing');
      expect(item.description).toMatch(/^c0ffee01 · Jane Doe · /);
      expect(item.tooltip).toBe(restCommit.message);
      expect(item.contextValue).toMatch('web-openable');
      expect(item.webUrl).toBe(`${mr.web_url}/diffs?commit_id=${restCommit.id}`);
    });

    it('lists the files of the commit at scoped URIs and adds its threads', async () => {
      const [file] = await new CommitItem(restCommit, context()).getChildren();

      expect(file).toBeInstanceOf(ChangedFileItem);
      const { baseFileUri, headFileUri } = file as ChangedFileItem;
      expect(fromReviewUri(baseFileUri)).toMatchObject({
        commit: 'parent1',
        scope: `parent1..${restCommit.id}`,
      });
      expect(fromReviewUri(headFileUri)).toMatchObject({
        commit: restCommit.id,
        scope: `parent1..${restCommit.id}`,
      });
      expect(file.command?.command).toBe(USER_COMMANDS.OPEN_MR_FILE_SIDE_BY_SIDE);
      expect(commitThreads.addThreadsFor).toHaveBeenCalledTimes(1);
    });

    it('marks a merge commit', async () => {
      service.getCommit.mockResolvedValue({ ...restCommit, parent_ids: ['parent1', 'parent2'] });

      const [note, file] = await new CommitItem(restCommit, context()).getChildren();

      expect(note.label).toBe('Merge commit, compared with its first parent');
      expect(file).toBeInstanceOf(ChangedFileItem);
    });

    it('says so when GitLab no longer has the commit', async () => {
      service.getCommitDiff.mockRejectedValue(notFound());

      const children = await new CommitItem(restCommit, context()).getChildren();

      expect(children.map(c => c.label)).toEqual(["Couldn't load this commit."]);
      expect(handleError).not.toHaveBeenCalled();
    });

    it('reports any other failure and lists nothing', async () => {
      const error = new FetchError({ status: 500 } as Response, 'commit diff');
      service.getCommitDiff.mockRejectedValue(error);

      expect(await new CommitItem(restCommit, context()).getChildren()).toEqual([]);
      expect(handleError).toHaveBeenCalledWith(error);
    });
  });
});
