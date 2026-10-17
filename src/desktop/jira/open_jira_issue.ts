import * as vscode from 'vscode';
import { handleError } from '../../common/errors/handle_error';
import { log } from '../../common/log';
import { openUrl } from '../commands/openers';
import { getActiveProjectOrSelectOne } from '../commands/run_with_valid_project';
import { getTrackingBranchName } from '../git/get_tracking_branch_name';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { getOpenMergeRequestsForBranch } from '../gitlab/api/get_open_merge_requests_for_branch';
import { isUnauthorized } from '../gitlab/is_unauthorized';
import { DetachedHeadError } from '../errors/detached_head_error';
import {
  JIRA_CONFIG_SECTION,
  JiraLinkConfig,
  FoundJiraKey,
  MAX_JIRA_ITEMS,
  findJiraKeysFor,
  getJiraLinkConfig,
  jiraIssueUrl,
  jiraItemText,
} from './jira_keys';

export const CONFIGURE_JIRA_URL = 'Configure Jira URL';

const JIRA_KEY_ARGUMENT = /^[A-Z][A-Z0-9_]+-[1-9]\d*$/;

const offerConfiguration = async () => {
  const choice = await vscode.window.showInformationMessage(
    `Jira links are off. Set ${JIRA_CONFIG_SECTION}.url to the base URL of your Jira.`,
    CONFIGURE_JIRA_URL,
  );
  if (choice === CONFIGURE_JIRA_URL) {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      `${JIRA_CONFIG_SECTION}.url`,
    );
  }
};

const findCurrentBranchKeys = async (
  config: JiraLinkConfig,
): Promise<{ branch: string; keys: FoundJiraKey[] } | undefined> => {
  const projectInRepository = await getActiveProjectOrSelectOne();
  if (!projectInRepository) return undefined;
  const branch = await getTrackingBranchName(projectInRepository.pointer.repository.rawRepository);
  if (!branch) throw new DetachedHeadError();
  let mr: RestMr | undefined;
  try {
    [mr] = await getGitLabService(projectInRepository).fetchFromApi(
      getOpenMergeRequestsForBranch(projectInRepository.project, branch),
    );
  } catch (e) {
    // the branch name alone may still name the issue, but a refused token needs the user
    log.warn(`Could not load the merge request of ${branch} to look for Jira keys: ${e}`);
    if (isUnauthorized(e)) handleError(e as Error);
  }
  return { branch, keys: findJiraKeysFor(config, { branch, mr }) };
};

const pickKey = async (keys: FoundJiraKey[]): Promise<string | undefined> => {
  const item = await vscode.window.showQuickPick(
    keys.slice(0, MAX_JIRA_ITEMS).map(found => ({ ...jiraItemText(found), key: found.key })),
    {
      title: 'Open Jira Issue',
      placeHolder: 'Select a Jira issue',
      matchOnDescription: true,
      ignoreFocusOut: true,
    },
  );
  return item?.key;
};

/**
 * `gl.openJiraIssue`: opens the Jira issue given as an argument, or the one named by
 * the current branch or its open merge request. Several keys are offered in a quick pick.
 */
export const openJiraIssue = async (key?: unknown): Promise<void> => {
  const config = getJiraLinkConfig();
  if (!config) {
    await offerConfiguration();
    return;
  }
  if (typeof key === 'string' && JIRA_KEY_ARGUMENT.test(key)) {
    await openUrl(jiraIssueUrl(config, key));
    return;
  }
  const found = await findCurrentBranchKeys(config);
  if (!found) return;
  if (found.keys.length === 0) {
    await vscode.window.showInformationMessage(
      `No Jira key found in branch ${found.branch} or its merge request.`,
    );
    return;
  }
  const picked = found.keys.length === 1 ? found.keys[0].key : await pickKey(found.keys);
  if (picked) await openUrl(jiraIssueUrl(config, picked));
};
