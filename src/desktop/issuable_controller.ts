import * as fs from 'fs';
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
import { generateSecret } from './utils/generate_secret';
import { WEBVIEW_WORKFLOW } from './constants';
import { RepositoryRootWebviewProvider } from './commands/run_with_valid_project';
import { waitForWebview } from '../common/utils/wait_for_webview';

const webviewResourcePaths = {
  // These are the paths to the resources in `dist-desktop/`
  appScriptUri: 'webviews/issuable/assets/app.js',
  styleUri: 'webviews/issuable/assets/index.css',
} as const;

type WebviewResources = Record<keyof typeof webviewResourcePaths, vscode.Uri>;

export type IssuableWebviewPanel = vscode.WebviewPanel & {
  repositoryRoot?: string;
};

async function initPanelIfActive(
  panel: vscode.WebviewPanel,
  issuable: RestIssuable,
  gitlabService: GitLabService,
) {
  if (!panel.active) return;

  const waitPromise = waitForWebview(panel.webview);

  const discussionsAndLabels = await gitlabService
    .getDiscussionsAndLabelEvents(issuable)
    .catch(e => {
      handleError(e);
      return [];
    });

  await waitPromise;
  await panel.webview.postMessage({
    type: 'issuableFetch',
    issuable,
    discussions: discussionsAndLabels,
  });
}

class IssuableController implements RepositoryRootWebviewProvider {
  context?: vscode.ExtensionContext;

  openedPanels: Record<string, IssuableWebviewPanel | undefined> = {};

  init(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private getResources(panel: vscode.WebviewPanel): WebviewResources {
    return Object.entries(webviewResourcePaths).reduce((acc, [key, value]) => {
      assert(this.context);
      const uri = vscode.Uri.file(path.join(this.context.extensionPath, value));
      return { ...acc, [key]: panel.webview.asWebviewUri(uri) };
    }, {}) as WebviewResources;
  }

  private replaceResources(panel: vscode.WebviewPanel) {
    assert(this.context);
    const { appScriptUri, styleUri } = this.getResources(panel);
    const nonce = generateSecret();

    return fs
      .readFileSync(path.join(this.context.extensionPath, 'webviews/issuable/index.html'), 'UTF-8')
      .replace(/{{nonce}}/gm, nonce)
      .replace(/<script /g, `<script nonce="${nonce}"`)
      .replace('/issuable/assets/index.css', styleUri.toString())
      .replace('/issuable/assets/app.js', appScriptUri.toString());
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
      panel: vscode.WebviewPanel,
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
            issuable,
            discussions: discussionsAndLabels,
          });
          await panel.webview.postMessage({ type: 'noteSaved' });
        } catch (e) {
          log.error('Failed to submit note to the API.', e);
          await panel.webview.postMessage({ type: 'noteSaved', status: false });
        }
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
    const html = this.replaceResources(panel);
    panel.webview.html = html;
    panel.iconPath = this.getIconPathForIssuable(issuable);
    panel.repositoryRoot = repositoryRoot;

    await initPanelIfActive(panel, issuable, getGitLabService(projectInRepository));
    panel.onDidChangeViewState(async () => {
      await initPanelIfActive(panel, issuable, getGitLabService(projectInRepository));
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
}

export const issuableController = new IssuableController();
