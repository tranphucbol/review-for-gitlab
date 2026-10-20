import * as path from 'path';
import * as vscode from 'vscode';
import assert from 'assert';
import { log } from '../common/log';
import { handleError } from '../common/errors/handle_error';
import { isMr } from './utils/is_mr';
import { makeHtmlLinksAbsolute } from './utils/make_html_links_absolute';
import { GitLabService } from './gitlab/gitlab_service';
import { gitlabProjectRepository } from './gitlab/gitlab_project_repository';
import { ProjectInRepository } from './gitlab/new_project';
import { getGitLabService } from './gitlab/get_gitlab_service';
import { getJiraLinkConfig } from './jira/jira_keys';
import { UserFriendlyError } from './errors/user_friendly_error';
import { toUploadError, uploadAttachments } from './review/comment_attachment_provider';
import { WEBVIEW_WORKFLOW } from './constants';
import { RepositoryRootWebviewProvider } from './commands/run_with_valid_project';
import { waitForWebview } from '../common/utils/webviews/wait_for_webview';
import { prepareWebviewSource } from '../common/utils/webviews/prepare_webview_source';

export type IssuableWebviewPanel = vscode.WebviewPanel & {
  repositoryRoot?: string;
  issuable?: RestIssuable;
  /** The reload in flight, so a second request joins it instead of reading twice. */
  reloading?: Promise<void>;
};

/** True while the active Overview shows a merge request; it shows the merge request actions button. */
export const MR_OVERVIEW_ACTIVE_CONTEXT = 'gitlab:mergeRequestOverviewActive';

// fork-only: Jira links, see docs/decisions/009
const postJiraLinks = (panel: vscode.WebviewPanel) =>
  panel.webview.postMessage({ type: 'jiraLinks', config: getJiraLinkConfig() ?? null });

const updateOverviewContext = async (panel: IssuableWebviewPanel) => {
  if (!panel.active || !panel.issuable) return;
  await vscode.commands.executeCommand(
    'setContext',
    MR_OVERVIEW_ACTIVE_CONTEXT,
    isMr(panel.issuable),
  );
};

// fork-only: a list item lacks `head_pipeline`, which the Overview sidebar shows
const getMrDetailOrItself = (issuable: RestIssuable, gitlabService: GitLabService) =>
  isMr(issuable)
    ? gitlabService.getMrDetail(issuable).catch(e => {
        log.warn('Failed to load the merge request details for the Overview.', e);
        return issuable;
      })
    : Promise.resolve(issuable);

interface UploadImageMessage {
  name: string;
  contentType: string;
  base64: string;
}

/** Uploads to the merge request's project, the one its notes are created in. */
const uploadOverviewImage = async (
  issuable: RestIssuable,
  projectInRepository: ProjectInRepository,
  { name, contentType, base64 }: UploadImageMessage,
): Promise<string> => {
  if (!isMr(issuable)) {
    throw new UserFriendlyError(
      'Images can be attached only to merge request comments.',
      new Error(`${issuable.references.full} is not a merge request.`),
    );
  }
  try {
    return await uploadAttachments({ mr: issuable, projectInRepository }, [
      { name, contentType, read: async () => new Uint8Array(Buffer.from(base64, 'base64')) },
    ]);
  } catch (e) {
    throw toUploadError(issuable, e as Error);
  }
};

async function initPanelIfActive(
  panel: IssuableWebviewPanel,
  issuable: RestIssuable,
  gitlabService: GitLabService,
) {
  if (!panel.active) return;

  const waitPromise = waitForWebview(panel.webview);

  const [details, discussionsAndLabels] = await Promise.all([
    getMrDetailOrItself(issuable, gitlabService),
    gitlabService.getDiscussionsAndLabelEvents(issuable).catch(e => {
      handleError(e);
      return [];
    }),
  ]);
  // eslint-disable-next-line no-param-reassign
  panel.issuable = details;

  await waitPromise;
  await postJiraLinks(panel);
  await panel.webview.postMessage({
    type: 'issuableFetch',
    issuable: details,
    discussions: discussionsAndLabels,
  });
}

// fork-only: the Overview's Reload, see docs/decisions/017
// a panel closed mid-reload refuses messages, and there is nobody left to tell
const postReloadState = (panel: IssuableWebviewPanel, message: object) =>
  Promise.resolve(panel.webview.postMessage(message)).catch(e =>
    log.warn('The Overview closed before it reloaded.', e),
  );

const readAndPostIssuable = async (panel: IssuableWebviewPanel, gitlabService: GitLabService) => {
  let ok = false;
  await postReloadState(panel, { type: 'issuableReloading' });
  try {
    const current = panel.issuable;
    assert(current, 'The Overview has no issuable to reload.');
    const [issuable, discussions] = await Promise.all([
      isMr(current) ? gitlabService.getMrDetail(current) : Promise.resolve(current),
      gitlabService.getDiscussionsAndLabelEvents(current),
    ]);
    // eslint-disable-next-line no-param-reassign
    panel.issuable = issuable;
    // the webview is already initialized: it sent `appReady` once, when it loaded
    await panel.webview.postMessage({ type: 'issuableFetch', issuable, discussions });
    ok = true;
  } catch (e) {
    handleError(e);
  } finally {
    await postReloadState(panel, { type: 'issuableReloaded', ok });
  }
};

/** Re-reads the issuable and its discussions; the Overview keeps its page if a read fails. */
const reloadPanel = (panel: IssuableWebviewPanel, gitlabService: GitLabService) => {
  if (!panel.reloading) {
    // eslint-disable-next-line no-param-reassign
    panel.reloading = readAndPostIssuable(panel, gitlabService).finally(() => {
      // eslint-disable-next-line no-param-reassign
      panel.reloading = undefined;
    });
  }
  return panel.reloading;
};

const gitlabServiceForPanel = (panel: IssuableWebviewPanel) =>
  getGitLabService(gitlabProjectRepository.getProjectOrFail(panel.repositoryRoot!));

class IssuableController implements RepositoryRootWebviewProvider {
  context?: vscode.ExtensionContext;

  openedPanels: Record<string, IssuableWebviewPanel | undefined> = {};

  init(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private createPanel(issuable: RestIssuable) {
    assert(this.context);
    const title = `${issuable.title.slice(0, 20)}...`;

    return vscode.window.createWebviewPanel(WEBVIEW_WORKFLOW, title, vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'webviews')),
        vscode.Uri.file(path.join(this.context.extensionPath, 'assets')),
      ],
      retainContextWhenHidden: true,
    }) as IssuableWebviewPanel;
  }

  // eslint-disable-next-line class-methods-use-this
  private createMessageHandler =
    (
      panel: IssuableWebviewPanel,
      issuable: RestIssuable,
      projectInRepository: ProjectInRepository,
    ) =>
    // FIXME: specify correct type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (message: any) => {
      if (message.command === 'renderMarkdown') {
        let rendered = await getGitLabService(projectInRepository).renderMarkdown(
          message.markdown,
          projectInRepository.project,
        );
        rendered = makeHtmlLinksAbsolute(rendered || '', projectInRepository.account.instanceUrl);

        await panel.webview.postMessage({
          type: 'markdownRendered',
          ref: message.ref,
          object: message.object,
          markdown: rendered,
        });
      }

      if (message.command === 'saveNote') {
        try {
          const gitlabService = getGitLabService(projectInRepository);
          await gitlabService.createNote(issuable, message.note, message.replyId);
          const discussionsAndLabels = await gitlabService.getDiscussionsAndLabelEvents(issuable);
          await panel.webview.postMessage({
            type: 'issuableFetch',
            issuable: panel.issuable ?? issuable,
            discussions: discussionsAndLabels,
          });
          await panel.webview.postMessage({ type: 'noteSaved' });
        } catch (e) {
          log.error('Failed to submit note to the API.', e);
          await panel.webview.postMessage({ type: 'noteSaved', status: false });
        }
      }

      // fork-only: images pasted into an Overview comment, see docs/decisions/003
      if (message.command === 'uploadImage') {
        const { requestId } = message;
        try {
          const markdown = await uploadOverviewImage(
            panel.issuable ?? issuable,
            projectInRepository,
            message,
          );
          await panel.webview.postMessage({ type: 'imageUploaded', requestId, markdown });
        } catch (e) {
          handleError(e as Error);
          await panel.webview.postMessage({
            type: 'imageUploaded',
            requestId,
            error: (e as Error).message,
          });
        }
      }

      if (message.command === 'reloadIssuable') {
        await reloadPanel(panel, getGitLabService(projectInRepository));
      }
    };

  private getIconPathForIssuable(issuable: RestIssuable) {
    const getIconUri = (shade: string, file: string) =>
      vscode.Uri.file(
        path.join(this.context!.extensionPath, 'src', 'assets', 'images', shade, file),
      );
    const lightIssueIcon = getIconUri('light', 'issues.svg');
    const lightMrIcon = getIconUri('light', 'merge_requests.svg');
    const darkIssueIcon = getIconUri('dark', 'issues.svg');
    const darkMrIcon = getIconUri('dark', 'merge_requests.svg');
    return isMr(issuable)
      ? { light: lightMrIcon, dark: darkMrIcon }
      : { light: lightIssueIcon, dark: darkIssueIcon };
  }

  async open(issuable: RestIssuable, repositoryRoot: string) {
    const panelKey = `${repositoryRoot}-${issuable.id}`;
    const openedPanel = this.openedPanels[panelKey];
    if (openedPanel) {
      openedPanel.reveal();
      return openedPanel;
    }
    const newPanel = await this.create(issuable, repositoryRoot);
    this.openedPanels[panelKey] = newPanel;
    newPanel.onDidDispose(() => {
      this.openedPanels[panelKey] = undefined;
    });
    return newPanel;
  }

  private async create(issuable: RestIssuable, repositoryRoot: string) {
    assert(this.context);
    const projectInRepository = gitlabProjectRepository.getProjectOrFail(repositoryRoot);

    const panel = this.createPanel(issuable);
    panel.webview.html = await prepareWebviewSource(panel.webview, this.context, 'issuable');
    panel.iconPath = this.getIconPathForIssuable(issuable);
    panel.repositoryRoot = repositoryRoot;
    panel.issuable = issuable;

    await updateOverviewContext(panel);
    await initPanelIfActive(panel, issuable, getGitLabService(projectInRepository));
    panel.onDidChangeViewState(async () => {
      await updateOverviewContext(panel);
      await initPanelIfActive(
        panel,
        panel.issuable ?? issuable,
        getGitLabService(projectInRepository),
      );
    });

    panel.webview.onDidReceiveMessage(
      this.createMessageHandler(panel, issuable, projectInRepository),
    );
    return panel;
  }

  // eslint-disable-next-line class-methods-use-this
  matchesViewType(viewType: string): boolean {
    return viewType === `mainThreadWebview-${WEBVIEW_WORKFLOW}`;
  }

  get repositoryRootForActiveTab(): string | undefined {
    const panel = Object.values(this.openedPanels).find(p => p?.active);
    return panel?.repositoryRoot;
  }

  /** The merge request in the active Overview, if the active Overview shows one. */
  activeMergeRequest(): { mr: RestMr; repositoryRoot: string } | undefined {
    const panel = Object.values(this.openedPanels).find(p => p?.active);
    if (!panel?.issuable || !panel.repositoryRoot || !isMr(panel.issuable)) return undefined;
    return { mr: panel.issuable, repositoryRoot: panel.repositoryRoot };
  }

  /** Relinks Jira keys in every open Overview after the `gitlab.jira` settings change. */
  async refreshJiraLinks(): Promise<void> {
    const panels = Object.values(this.openedPanels).filter((p): p is IssuableWebviewPanel =>
      Boolean(p),
    );
    await Promise.all(panels.map(postJiraLinks));
  }

  /** Reloads the active Overview, the one `gl.reloadOverview` and its context menu act on. */
  async reloadActiveOverview(): Promise<void> {
    const panel = Object.values(this.openedPanels).find(p => p?.active);
    if (!panel?.issuable || !panel.repositoryRoot) return;
    try {
      await reloadPanel(panel, gitlabServiceForPanel(panel));
    } catch (e) {
      handleError(e);
    }
  }

  /** Reloads the Overview of `issuable` and brings it forward; opens it if it is closed. */
  async reloadOverview(issuable: RestIssuable, repositoryRoot: string): Promise<void> {
    const panel = this.openedPanels[`${repositoryRoot}-${issuable.id}`];
    if (!panel) {
      await this.open(issuable, repositoryRoot);
      return;
    }
    panel.reveal();
    try {
      await reloadPanel(panel, gitlabServiceForPanel(panel));
    } catch (e) {
      handleError(e);
    }
  }

  /** Reloads every Overview of `mr` after it changed, so it does not show a stale state. */
  async refreshMergeRequest(mr: RestMr): Promise<void> {
    const panels = Object.values(this.openedPanels).filter((p): p is IssuableWebviewPanel =>
      Boolean(p?.issuable && isMr(p.issuable) && p.issuable.id === mr.id && p.repositoryRoot),
    );
    await Promise.all(
      panels.map(async panel => {
        try {
          // a reload already in flight may have read the merge request before it changed
          await panel.reloading;
          await reloadPanel(panel, gitlabServiceForPanel(panel));
        } catch (e) {
          handleError(e);
        }
      }),
    );
  }
}

export const issuableController = new IssuableController();
