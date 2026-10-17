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
      'Open PC-12 in Jira from branch',
      'Open PE-3 in Jira from merge request description',
    ]);
    expect(asMock(vscode.window.showQuickPick).mock.calls[0][1]).toEqual(
      expect.objectContaining({ placeHolder: 'Select a Jira issue', ignoreFocusOut: true }),
    );
    expect(openUrl).toHaveBeenCalledWith(`${JIRA}PE-3`);
  });

  it('uses the merge request it is given instead of the current branch', async () => {
    await openJiraIssue({
      mr: { ...branchMr('PE-3: login'), source_branch: 'feature/login' },
      projectInRepository,
    });

    expect(openUrl).toHaveBeenCalledWith(`${JIRA}PE-3`);
    expect(getActiveProjectOrSelectOne).not.toHaveBeenCalled();
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
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('reports a refused token and still uses the branch', async () => {
    asMock(service.fetchFromApi).mockRejectedValue(
      Object.assign(new Error('401 Unauthorized'), { status: 401 }),
    );

    await openJiraIssue();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('401 Unauthorized', 'Show Logs');
    expect(openUrl).toHaveBeenCalledWith(`${JIRA}PC-12`);
  });

  it('offers at most five keys', async () => {
    asMock(service.fetchFromApi).mockResolvedValue([branchMr('PC-1 PC-2 PC-3 PC-4 PC-5 PC-6')]);

    await openJiraIssue();

    expect(asMock(vscode.window.showQuickPick).mock.calls[0][0]).toHaveLength(5);
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
