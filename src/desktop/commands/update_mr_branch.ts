import * as vscode from 'vscode';
import assert from 'assert';
import { MrItemModel } from '../tree_view/items/mr_item_model';
import { VS_COMMANDS } from '../command_names';
import { Repository } from '../api/git';
import { checkout } from '../git/checkout';

export const DROP_LOCAL_COMMITS = 'Drop Local Commits and Update';
export const KEEP_LOCAL_BRANCH = 'Keep Local Branch';

const handleGitError = async (e: { stderr: string }) => {
  const SEE_GIT_LOG = 'See Git Log';
  const choice = await vscode.window.showErrorMessage(`Update failed: ${e.stderr}`, SEE_GIT_LOG);
  if (choice === SEE_GIT_LOG) {
    await vscode.commands.executeCommand(VS_COMMANDS.GIT_SHOW_OUTPUT);
  }
};

const shortSha = (sha: string) => sha.slice(0, 8);

const getShaOrUndefined = async (
  rawRepository: Repository,
  ref: string,
): Promise<string | undefined> => {
  try {
    return (await rawRepository.getCommit(ref)).hash;
  } catch {
    return undefined;
  }
};

/**
 * Points the local branch at the remote-tracking branch and checks it out,
 * the equivalent of `git checkout -B <branch> <remoteRef>` built from the
 * public Git extension API, which has no reset.
 */
const resetBranchTo = async (
  rawRepository: Repository,
  branch: string,
  remoteRef: string,
  localExists: boolean,
) => {
  if (localExists) {
    // a checked-out branch can't be deleted, so step off it onto the remote commit first;
    // always, because `state.HEAD` can lag behind the repository, and a failing checkout
    // (a dirty work tree) then stops the update before the branch is gone
    await rawRepository.checkout(remoteRef);
    await rawRepository.deleteBranch(branch, true);
  }
  await rawRepository.createBranch(branch, true, remoteRef);
  await rawRepository.setBranchUpstream(branch, remoteRef);
  assert(
    rawRepository.state.HEAD?.name === branch,
    `The branch after the update (${rawRepository.state.HEAD?.name}) is not ${branch}. Inspect your repository before making any more changes.`,
  );
};

const askToDropLocalCommits = async (branch: string, remoteRef: string, localSha: string) =>
  vscode.window.showWarningMessage(
    `Local branch ${branch} has diverged from ${remoteRef}.`,
    {
      modal: true,
      detail: `The local branch has commits that are not on ${remoteRef}, and ${remoteRef} has commits that are not on the local branch (it may have been force-pushed).\n\nDrop the local commits and reset ${branch} to ${remoteRef}? The current tip, ${shortSha(
        localSha,
      )}, can be recovered with "git branch <name> ${localSha}".`,
    },
    DROP_LOCAL_COMMITS,
    KEEP_LOCAL_BRANCH,
  );

/**
 * Fetches the merge request source branch and brings the local branch up to date with it.
 * When the local branch has diverged, asks whether to drop the local commits.
 * Merge request must be from local branch.
 */
export const updateMrBranch = async (mrItemModel: MrItemModel): Promise<void> => {
  const { mr, projectInRepository } = mrItemModel;
  assert(
    mr.target_project_id === mr.source_project_id,
    'this command is only available for same-project MRs',
  );
  const { rawRepository } = projectInRepository.pointer.repository;
  const remoteName = projectInRepository.pointer.remote.name;
  const branch = mr.source_branch;
  const remoteRef = `${remoteName}/${branch}`;
  try {
    const { localSha, remoteSha, mergeBase } = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Fetching ${remoteRef}` },
      async () => {
        await rawRepository.fetch(remoteName, branch);
        const remote = await getShaOrUndefined(rawRepository, `refs/remotes/${remoteRef}`);
        assert(remote, `Branch ${remoteRef} doesn't exist after fetching ${remoteName}.`);
        const local = await getShaOrUndefined(rawRepository, `refs/heads/${branch}`);
        const base = local && (await rawRepository.getMergeBase(local, remote));
        return { localSha: local, remoteSha: remote, mergeBase: base };
      },
    );

    if (localSha === remoteSha) {
      await checkout(rawRepository, branch);
      await vscode.window.showInformationMessage(
        `Branch ${branch} is up to date with ${remoteRef}`,
      );
      return;
    }

    if (localSha && mergeBase === remoteSha) {
      await checkout(rawRepository, branch);
      // local-only commits stay on the checked-out branch: a warning, as when it has diverged
      await vscode.window.showWarningMessage(
        `Branch ${branch} has local commits that are not on ${remoteRef}, there is nothing to update. Push them to share them.`,
      );
      return;
    }

    const diverged = Boolean(localSha) && mergeBase !== localSha;
    if (diverged) {
      const choice = await askToDropLocalCommits(branch, remoteRef, localSha!);
      if (choice === KEEP_LOCAL_BRANCH) {
        await checkout(rawRepository, branch);
        await vscode.window.showWarningMessage(
          `Branch changed to ${branch}, but it has diverged from ${remoteRef}. Nothing was dropped.`,
        );
        return;
      }
      if (choice !== DROP_LOCAL_COMMITS) return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Updating ${branch}` },
      () => resetBranchTo(rawRepository, branch, remoteRef, Boolean(localSha)),
    );

    if (diverged) {
      await vscode.window.showInformationMessage(
        `Branch ${branch} reset to ${remoteRef}. Dropped local tip ${shortSha(localSha!)}.`,
      );
      return;
    }
    await vscode.window.showInformationMessage(`Branch ${branch} updated to ${remoteRef}`);
  } catch (e) {
    if (e.gitErrorCode) {
      await handleGitError(e);
      return;
    }
    throw e;
  }
};
