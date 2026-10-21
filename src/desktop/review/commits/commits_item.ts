import * as vscode from 'vscode';
import { handleError } from '../../../common/errors/handle_error';
import { log } from '../../../common/log';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { isNotFound } from '../versions/mr_version_comparison';
import { CommitContext, CommitItem } from './commit_item';

/** fork-only: the `Commits (N)` node under a merge request, newest first */
export class CommitsItem extends vscode.TreeItem {
  readonly #commits: RestCommit[];

  readonly #context: CommitContext;

  constructor(commits: RestCommit[], context: CommitContext) {
    super(`Commits (${commits.length})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.#commits = commits;
    this.#context = context;
    this.iconPath = new vscode.ThemeIcon('git-commit');
  }

  getChildren(): vscode.TreeItem[] {
    return this.#commits.map(commit => new CommitItem(commit, this.#context));
  }
}

/**
 * The version detail lists the commits on 13.12, so this costs no request there. Without
 * the list, the commits route is asked; a 404 there means it isn't supported and the
 * node is left out (docs/decisions/001).
 */
export const createCommitsItem = async (context: CommitContext): Promise<CommitsItem[]> => {
  const { mr, mrVersion, projectInRepository } = context;
  try {
    const commits =
      mrVersion.commits ?? (await getGitLabService(projectInRepository).getMrCommits(mr));
    return commits.length ? [new CommitsItem(commits, context)] : [];
  } catch (e) {
    if (isNotFound(e)) {
      log.warn(`Merge request !${mr.iid} has no commit list on this GitLab. Hiding its commits.`);
    } else {
      handleError(e as Error);
    }
    return [];
  }
};
