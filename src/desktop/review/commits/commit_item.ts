import * as vscode from 'vscode';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { handleError } from '../../../common/errors/handle_error';
import { ProjectInRepository } from '../../gitlab/new_project';
import { ChangedFileItem } from '../../tree_view/items/changed_file_item';
import { ChangedFolderItem, FolderTreeItem } from '../../tree_view/items/changed_folder_item';
import { getSidebarViewState, SidebarViewState } from '../../tree_view/sidebar_view_state';
import { isNotFound } from '../versions/mr_version_comparison';
import { CommitThreads } from './commit_threads';
import { CommitVersion, isMergeCommit, loadCommitVersion } from './commit_versions';

dayjs.extend(relativeTime);

export interface CommitContext {
  mr: RestMr;
  mrVersion: RestMrVersion;
  projectInRepository: ProjectInRepository;
  commitThreads: CommitThreads;
}

const messageItem = (label: string, icon: string): vscode.TreeItem => {
  const item = new vscode.TreeItem(label);
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
};

/** fork-only: one commit of a merge request; expanding it lists only that commit's files */
export class CommitItem extends vscode.TreeItem {
  readonly commit: RestCommit;

  readonly #context: CommitContext;

  constructor(commit: RestCommit, context: CommitContext) {
    super(commit.title, vscode.TreeItemCollapsibleState.Collapsed);
    this.commit = commit;
    this.#context = context;
    this.iconPath = new vscode.ThemeIcon('git-commit');
    this.description = `${commit.short_id} · ${commit.author_name} · ${dayjs(
      commit.authored_date,
    ).fromNow()}`;
    this.tooltip = commit.message;
    this.contextValue = 'web-openable;mr-commit-item';
  }

  /** the commit inside the merge request, as GitLab's Commits tab links it */
  get webUrl(): string {
    return `${this.#context.mr.web_url}/diffs?commit_id=${this.commit.id}`;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    const { mr, mrVersion, projectInRepository, commitThreads } = this.#context;
    let version: CommitVersion;
    try {
      version = await loadCommitVersion(mr, mrVersion, projectInRepository, this.commit.id);
    } catch (e) {
      if (isNotFound(e)) return [messageItem("Couldn't load this commit.", 'warning')];
      handleError(e as Error);
      return [];
    }
    commitThreads.addThreadsFor(version);
    const repositoryRoot = projectInRepository.pointer.repository.rootFsPath;
    const createChangedFiles = (shownInList: boolean): FolderTreeItem[] =>
      version.diffs.map(diff => ({
        path: diff.new_path || diff.old_path,
        item: new ChangedFileItem(
          mr,
          version,
          diff,
          repositoryRoot,
          commitThreads.hasComments,
          shownInList,
        ),
      }));
    const changedFiles =
      getSidebarViewState() === SidebarViewState.TreeView
        ? new ChangedFolderItem('', createChangedFiles(false)).getChildren()
        : createChangedFiles(true).map(file => file.item);
    const mergeNote = isMergeCommit(version)
      ? [messageItem('Merge commit, compared with its first parent', 'git-merge')]
      : [];
    return [...mergeNote, ...changedFiles];
  }
}
