import * as vscode from 'vscode';
import { issuableController } from '../issuable_controller';
import { MR_OVERVIEW_ITEM_CONTEXT } from '../tree_view/items/mr_item_model';

/**
 * fork-only, see docs/decisions/017. From the sidebar's Overview item, reloads that merge
 * request's Overview; from the Overview's context menu or the palette, the active Overview.
 */
export const reloadOverview = async (item?: unknown): Promise<void> => {
  if (
    item instanceof vscode.TreeItem &&
    item.contextValue === MR_OVERVIEW_ITEM_CONTEXT &&
    item.command?.arguments
  ) {
    const [mr, repositoryRoot] = item.command.arguments as [RestMr, string];
    await issuableController.reloadOverview(mr, repositoryRoot);
    return;
  }
  await issuableController.reloadActiveOverview();
};
