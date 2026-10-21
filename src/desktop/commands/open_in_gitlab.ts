import * as vscode from 'vscode';
import { MrItemModel } from '../tree_view/items/mr_item_model';
import { IssueItem } from '../tree_view/items/issue_item';
import { CommitItem } from '../review/commits/commit_item';
import { openUrl } from './openers';

type WebOpenableItem = IssueItem | MrItemModel | CommitItem;

const getWebUrl = (item: WebOpenableItem): string => {
  if (item instanceof CommitItem) return item.webUrl;
  if (item instanceof IssueItem) {
    const { issue } = item;
    return issue.web_url;
  }
  if (item instanceof MrItemModel) {
    const { mr } = item;
    return mr.web_url;
  }
  throw new Error('Invalid item type');
};

/**
 * Command will open corresponding Issue/MR in browser
 */
export const openInGitLab = async (item: WebOpenableItem): Promise<void> => {
  await openUrl(getWebUrl(item));
};

/**
 * Command will copy corresponding Issue/MR url to clipboard
 */
export const copyLinkToClipboard = async (item: WebOpenableItem): Promise<void> => {
  await vscode.env.clipboard.writeText(getWebUrl(item));
};
