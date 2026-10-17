import * as vscode from 'vscode';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { GitLabService } from '../gitlab/gitlab_service';
import { ProjectInRepository } from '../gitlab/new_project';
import { getTrackingBranchName } from '../git/get_tracking_branch_name';
import { getActiveProjectOrSelectOne } from '../commands/run_with_valid_project';
import { openUrl } from '../commands/openers';
import { createFakePartial } from '../../common/test_utils/create_fake_partial';
import { asMock } from '../test_utils/as_mock';
import { mr } from '../test_utils/entities';
import { DetachedHeadError } from '../errors/detached_head_error';
import { CONFIGURE_JIRA_URL, openJiraIssue } from './open_jira_issue';

jest.mock('../gitlab/get_gitlab_service');
jest.mock('../git/get_tracking_branch_name');
jest.mock('../commands/run_with_valid_project');
jest.mock('../commands/openers');
jest.mock('../../common/log');

const JIRA = 'https://jira.example.com/browse/';

describe('openJiraIssue', () => {
  let service: GitLabService;
  const projectInRepository = createFakePartial<ProjectInRepository>({
    project: { namespaceWithPath: 'group/project' },
    pointer: { repository: { rawRepository: {} } },
  });
  const mockJiraUrl = (url?: string) =>
    jest
      .mocked(vscode.workspace.getConfiguration)
      .mockReturnValue({ url } as unknown as vscode.WorkspaceConfiguration);
  const branchMr = (title: string, description: string | null = null) => ({
    ...mr,
    title,
    description,
  });

  beforeEach(() => {
    mockJiraUrl('https://jira.example.com/');
    service = createFakePartial<GitLabService>({
      fetchFromApi: jest.fn().mockResolvedValue([]),
    });
    asMock(getGitLabService).mockReturnValue(service);
    asMock(getActiveProjectOrSelectOne).mockResolvedValue(projectInRepository);
    asMock(getTrackingBranchName).mockResolvedValue('feature/PC-12-retries');
  });

  afterEach(() => mockJiraUrl(undefined));

  it('opens the key it is given without looking at the branch', async () => {
    await openJiraIssue('PE-3');

    expect(openUrl).toHaveBeenCalledWith(`${JIRA}PE-3`);
    expect(getActiveProjectOrSelectOne).not.toHaveBeenCalled();
  });

  it('opens the only key of the current branch', async () => {
    await openJiraIssue();

    expect(openUrl).toHaveBeenCalledWith(`${JIRA}PC-12`);
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it('offers every key of the branch and its merge request in a quick pick', async () => {
    asMock(service.fetchFromApi).mockResolvedValue([branchMr('PC-12: retries', 'For PE-3.')]);
    asMock(vscode.window.showQuickPick).mockImplementation(
      async items => (items as vscode.QuickPickItem[])[1],
    );

    await openJiraIssue();

    const items = asMock(vscode.window.showQuickPick).mock.calls[0][0] as vscode.QuickPickItem[];
    expect(items.map(i => `${i.label} ${i.description}`)).toEqual([
      'PC-12 from branch',
      'PE-3 from merge request description',
    ]);
    expect(openUrl).toHaveBeenCalledWith(`${JIRA}PE-3`);
  });

  it('opens nothing when the pick is dismissed', async () => {
    asMock(service.fetchFromApi).mockResolvedValue([branchMr('PE-3')]);
    asMock(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await openJiraIssue();

    expect(openUrl).not.toHaveBeenCalled();
  });

  it('says so when neither the branch nor the merge request names a key', async () => {
    asMock(getTrackingBranchName).mockResolvedValue('main');

    await openJiraIssue();

    expect(openUrl).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'No Jira key found in branch main or its merge request.',
    );
  });

  it('still uses the branch when the merge request cannot be loaded', async () => {
    asMock(service.fetchFromApi).mockRejectedValue(new Error('offline'));

    await openJiraIssue();

    expect(openUrl).toHaveBeenCalledWith(`${JIRA}PC-12`);
  });

  it('fails on a detached HEAD', async () => {
    asMock(getTrackingBranchName).mockResolvedValue(undefined);

    await expect(openJiraIssue()).rejects.toBeInstanceOf(DetachedHeadError);
  });

  it('offers to configure the URL when Jira links are off', async () => {
    mockJiraUrl(undefined);
    asMock(vscode.window.showInformationMessage).mockResolvedValue(CONFIGURE_JIRA_URL);

    await openJiraIssue('PC-12');

    expect(openUrl).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      'gitlab.jira.url',
    );
  });
});
