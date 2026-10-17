import * as vscode from 'vscode';
import { MrItemModel } from '../tree_view/items/mr_item_model';
import { DROP_LOCAL_COMMITS, KEEP_LOCAL_BRANCH, updateMrBranch } from './update_mr_branch';
import { mr, projectInRepository } from '../test_utils/entities';
import { GitErrorCodes, Repository } from '../api/git';
import { checkout } from '../git/checkout';
import { asMock } from '../test_utils/as_mock';
import { ProjectInRepository } from '../gitlab/new_project';
import { GitRemote } from '../git/new_git';

jest.mock('../git/checkout');

const LOCAL_SHA = 'aaaaaaaa1111';
const REMOTE_SHA = 'bbbbbbbb2222';
const BASE_SHA = 'cccccccc3333';

describe('update MR branch', () => {
  let mrItemModel: MrItemModel;
  let rawRepository: Repository;
  let shas: Record<string, string | undefined>;
  let mergeBase: string;
  let headName: string | undefined;

  const createRepository = () =>
    ({
      state: {
        get HEAD() {
          return headName ? { name: headName } : undefined;
        },
      },
      fetch: jest.fn(),
      getCommit: jest.fn(async (ref: string) => {
        const hash = shas[ref];
        if (!hash) throw new Error(`unknown ref ${ref}`);
        return { hash };
      }),
      getMergeBase: jest.fn(async () => mergeBase),
      checkout: jest.fn(async (treeish: string) => {
        headName = treeish.startsWith('origin/') ? undefined : treeish;
      }),
      deleteBranch: jest.fn(),
      createBranch: jest.fn(async (name: string) => {
        headName = name;
      }),
      setBranchUpstream: jest.fn(),
    }) as unknown as Repository;

  const createMrItemModel = (mrOverrides = {}) => {
    const testProjectInRepo: ProjectInRepository = {
      ...projectInRepository,
      pointer: {
        ...projectInRepository.pointer,
        remote: { name: 'origin', urlEntries: [] } as GitRemote,
        repository: { ...projectInRepository.pointer.repository, rawRepository },
      },
    };
    return new MrItemModel(
      {
        ...mr,
        source_project_id: 123,
        target_project_id: 123,
        source_branch: 'feature-a',
        ...mrOverrides,
      },
      testProjectInRepo,
    );
  };

  const setLocalAndRemote = (local: string | undefined, remote: string | undefined) => {
    shas = { 'refs/heads/feature-a': local, 'refs/remotes/origin/feature-a': remote };
  };

  beforeEach(() => {
    headName = 'main';
    mergeBase = BASE_SHA;
    setLocalAndRemote(LOCAL_SHA, REMOTE_SHA);
    rawRepository = createRepository();
    mrItemModel = createMrItemModel();
    (vscode.window.withProgress as jest.Mock).mockImplementation((_, task) => task());
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('fetches the source branch from the project remote', async () => {
    setLocalAndRemote(REMOTE_SHA, REMOTE_SHA);

    await updateMrBranch(mrItemModel);

    expect(rawRepository.fetch).toHaveBeenCalledWith('origin', 'feature-a');
  });

  it('checks out a branch that is already up to date', async () => {
    setLocalAndRemote(REMOTE_SHA, REMOTE_SHA);

    await updateMrBranch(mrItemModel);

    expect(checkout).toHaveBeenCalledWith(rawRepository, 'feature-a');
    expect(rawRepository.deleteBranch).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Branch feature-a is up to date with origin/feature-a.',
    );
  });

  it('creates a tracking branch when there is no local branch', async () => {
    setLocalAndRemote(undefined, REMOTE_SHA);

    await updateMrBranch(mrItemModel);

    expect(rawRepository.deleteBranch).not.toHaveBeenCalled();
    expect(rawRepository.createBranch).toHaveBeenCalledWith('feature-a', true, 'origin/feature-a');
    expect(rawRepository.setBranchUpstream).toHaveBeenCalledWith('feature-a', 'origin/feature-a');
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('fast-forwards a branch that is only behind without asking', async () => {
    mergeBase = LOCAL_SHA;

    await updateMrBranch(mrItemModel);

    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(rawRepository.deleteBranch).toHaveBeenCalledWith('feature-a', true);
    expect(rawRepository.createBranch).toHaveBeenCalledWith('feature-a', true, 'origin/feature-a');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Branch feature-a updated to origin/feature-a.',
    );
  });

  it('steps off the checked-out branch before recreating it', async () => {
    mergeBase = LOCAL_SHA;
    headName = 'feature-a';

    await updateMrBranch(mrItemModel);

    const checkoutOrder = asMock(rawRepository.checkout).mock.invocationCallOrder[0];
    const deleteOrder = asMock(rawRepository.deleteBranch).mock.invocationCallOrder[0];
    expect(rawRepository.checkout).toHaveBeenCalledWith('origin/feature-a');
    expect(checkoutOrder).toBeLessThan(deleteOrder);
  });

  it('steps off the branch even when HEAD does not report it as checked out', async () => {
    mergeBase = LOCAL_SHA;
    headName = 'main';

    await updateMrBranch(mrItemModel);

    const checkoutOrder = asMock(rawRepository.checkout).mock.invocationCallOrder[0];
    const deleteOrder = asMock(rawRepository.deleteBranch).mock.invocationCallOrder[0];
    expect(rawRepository.checkout).toHaveBeenCalledWith('origin/feature-a');
    expect(checkoutOrder).toBeLessThan(deleteOrder);
  });

  it('keeps the branch when stepping off it fails', async () => {
    mergeBase = LOCAL_SHA;
    asMock(rawRepository.checkout).mockRejectedValue({
      gitErrorCode: GitErrorCodes.DirtyWorkTree,
      stderr: 'Your local changes would be overwritten by checkout',
    });

    await updateMrBranch(mrItemModel);

    expect(rawRepository.deleteBranch).not.toHaveBeenCalled();
    expect(rawRepository.createBranch).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Update failed: Your local changes would be overwritten by checkout',
      'See Git Log',
    );
  });

  it('keeps a branch that is only ahead', async () => {
    mergeBase = REMOTE_SHA;

    await updateMrBranch(mrItemModel);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Branch feature-a has local commits that are not on origin/feature-a, so there is nothing to update. Push them to share them.',
    );
    expect(rawRepository.deleteBranch).not.toHaveBeenCalled();
    expect(checkout).toHaveBeenCalledWith(rawRepository, 'feature-a');
  });

  describe('when the local branch has diverged', () => {
    it('asks whether to drop the local commits', async () => {
      await updateMrBranch(mrItemModel);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Local branch feature-a has diverged from origin/feature-a.',
        expect.objectContaining({ modal: true, detail: expect.stringContaining(LOCAL_SHA) }),
        DROP_LOCAL_COMMITS,
        KEEP_LOCAL_BRANCH,
      );
    });

    it('resets the branch to the remote when the user drops the local commits', async () => {
      asMock(vscode.window.showWarningMessage).mockResolvedValue(DROP_LOCAL_COMMITS);

      await updateMrBranch(mrItemModel);

      expect(rawRepository.deleteBranch).toHaveBeenCalledWith('feature-a', true);
      expect(rawRepository.createBranch).toHaveBeenCalledWith(
        'feature-a',
        true,
        'origin/feature-a',
      );
      expect(rawRepository.setBranchUpstream).toHaveBeenCalledWith('feature-a', 'origin/feature-a');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Branch feature-a reset to origin/feature-a. Dropped local tip aaaaaaaa.',
      );
    });

    it('only checks out the branch when the user keeps it', async () => {
      asMock(vscode.window.showWarningMessage).mockResolvedValueOnce(KEEP_LOCAL_BRANCH);

      await updateMrBranch(mrItemModel);

      expect(checkout).toHaveBeenCalledWith(rawRepository, 'feature-a');
      expect(rawRepository.deleteBranch).not.toHaveBeenCalled();
    });

    it('changes nothing when the user cancels', async () => {
      asMock(vscode.window.showWarningMessage).mockResolvedValue(undefined);

      await updateMrBranch(mrItemModel);

      expect(checkout).not.toHaveBeenCalled();
      expect(rawRepository.checkout).not.toHaveBeenCalled();
      expect(rawRepository.deleteBranch).not.toHaveBeenCalled();
    });
  });

  it('fails when the remote branch does not exist', async () => {
    setLocalAndRemote(LOCAL_SHA, undefined);

    await expect(updateMrBranch(mrItemModel)).rejects.toMatchObject({
      message: "Branch origin/feature-a doesn't exist after fetching origin.",
    });
  });

  it('handles errors from the Git Extension', async () => {
    asMock(rawRepository.fetch).mockRejectedValue({
      gitErrorCode: GitErrorCodes.DirtyWorkTree,
      stderr: 'Git standard output',
    });

    await updateMrBranch(mrItemModel);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Update failed: Git standard output',
      'See Git Log',
    );
  });

  it('throws an error for an MR from a forked project', async () => {
    mrItemModel = createMrItemModel({ target_project_id: 456 });

    await expect(updateMrBranch(mrItemModel)).rejects.toMatchObject({
      message: 'This command is available only for merge requests from the same project.',
    });
  });
});
