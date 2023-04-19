import { MrItemModel } from '../tree_view/items/mr_item_model';
import { IssueItem } from '../tree_view/items/issue_item';
import { openUrl } from './openers';

/**
 * Command will open corresponding Issue/MR in browser
 */
export const openInGitLab = async (item: IssueItem | MrItemModel): Promise<void> => {
  if (item instanceof IssueItem) {
    const { issue } = item;
    await openUrl(issue.web_url);
  } else if (item instanceof MrItemModel) {
    const { mr } = item;
    await openUrl(mr.web_url);
  }
};
