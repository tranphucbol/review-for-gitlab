import * as vscode from 'vscode';
import { USER_COMMANDS } from '../command_names';
import { currentBranchRefresher, ValidBranchState } from '../current_branch_refresher';
import { asMock } from '../test_utils/as_mock';
import { job, pipeline, projectInRepository } from '../test_utils/entities';
import { triggerPipelineAction } from './trigger_pipeline_action';

jest.mock('../current_branch_refresher');

describe('triggerPipelineAction', () => {
  const jobs = [job];

  beforeEach(() => {
    const branchState: ValidBranchState = {
      valid: true,
      issues: [],
      jobs,
      userInitiated: false,
      projectInRepository,
      pipeline,
    };
    asMock(currentBranchRefresher.getOrRetrieveState).mockReturnValue(branchState);
    asMock(vscode.window.showQuickPick).mockImplementation(options => options[1]);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('can download artifacts', async () => {
    await triggerPipelineAction(projectInRepository);
    expect(vscode.commands.executeCommand).toBeCalled();

    const [command, jobProvider] = asMock(vscode.commands.executeCommand).mock.lastCall;
    expect(command).toBe(USER_COMMANDS.DOWNLOAD_ARTIFACTS);
    expect(jobProvider.getJobs()).toBe(jobs);
  });
});
