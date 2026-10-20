import * as path from 'path';
import * as vscode from 'vscode';
import assert from 'assert';
import { handleError } from '../../../common/errors/handle_error';
import { prepareWebviewSource } from '../../../common/utils/webviews/prepare_webview_source';
import { RepositoryRootWebviewProvider } from '../../commands/run_with_valid_project';
import { WEBVIEW_MR_DIFF } from '../../constants';
import { initDiffKeybindings } from './diff_keybindings';
import { DiffAction } from './messages';
import { MrDiffPanel, MrDiffTarget } from './mr_diff_panel';

const panelTitle = ({ mr, file }: MrDiffTarget) =>
  `${path.basename(file.new_path)} (!${mr.iid}) ↔`;

export class MrDiffPanelController implements RepositoryRootWebviewProvider {
  #context?: vscode.ExtensionContext;

  readonly #panels = new Map<string, MrDiffPanel>();

  init(context: vscode.ExtensionContext) {
    this.#context = context;
    initDiffKeybindings(context);
  }

  async open(target: MrDiffTarget): Promise<vscode.WebviewPanel> {
    assert(this.#context);
    const key = `${target.repositoryRoot}:${target.mr.id}:${target.file.new_path}`;
    const existing = this.#panels.get(key);
    if (existing) {
      existing.panel.reveal();
      // the sidebar may know a newer version of the merge request than the open view
      await existing.showVersion(target);
      return existing.panel;
    }
    const panel = vscode.window.createWebviewPanel(
      WEBVIEW_MR_DIFF,
      panelTitle(target),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.#context.extensionPath, 'webviews')),
          vscode.Uri.file(path.join(this.#context.extensionPath, 'assets')),
        ],
        retainContextWhenHidden: true,
      },
    );
    // the merge request icon the Overview shows, so its tab reads as part of the same review
    const { extensionPath } = this.#context;
    const iconUri = (shade: string) =>
      vscode.Uri.file(
        path.join(extensionPath, 'src', 'assets', 'images', shade, 'merge_requests.svg'),
      );
    panel.iconPath = { light: iconUri('light'), dark: iconUri('dark') };
    const mrDiffPanel = new MrDiffPanel(panel, target, this.#context.globalState);
    this.#panels.set(key, mrDiffPanel);
    panel.onDidDispose(() => {
      this.#panels.delete(key);
      mrDiffPanel.dispose();
    });
    // other views may have changed the discussions or the local file while this one was hidden
    panel.onDidChangeViewState(({ webviewPanel }) => {
      if (!webviewPanel.visible) return;
      mrDiffPanel.refreshDiscussions().catch(handleError);
      mrDiffPanel.refreshLocalState().catch(handleError);
      // keybindings.json has no change event; the user may have edited it meanwhile
      mrDiffPanel.refreshKeybindings().catch(handleError);
    });
    mrDiffPanel.start();
    const html = await prepareWebviewSource(panel.webview, this.#context, 'mr_diff');
    // a webview that was closed while its source was read can't take it
    if (this.#panels.get(key) === mrDiffPanel) panel.webview.html = html;
    return panel;
  }

  /** Shows or hides the local change buttons in every open view after the setting changes. */
  refreshLocalStates(): void {
    this.#panels.forEach(p => p.refreshLocalState().catch(handleError));
  }

  /** Recolours the code in every open view after the theme or its customizations change. */
  refreshTokenThemes(): void {
    this.#panels.forEach(p => p.refreshTokenTheme().catch(handleError));
  }

  /** Redraws the code in every open view after an editor font setting changes. */
  refreshEditorFonts(): void {
    this.#panels.forEach(p => p.refreshEditorFont().catch(handleError));
  }

  /** Relinks Jira keys in every open view after a `gitlab.jira` setting changes. */
  refreshJiraLinks(): void {
    this.#panels.forEach(p => p.refreshJiraLinks().catch(handleError));
  }

  /** Updates the keys of every open view after an extension, such as a keymap, comes or goes. */
  refreshKeybindings(): void {
    this.#panels.forEach(p => p.refreshKeybindings().catch(handleError));
  }

  /** Runs a `gl.sideBySide*` command in the active view; without one it does nothing. */
  async runAction(action: DiffAction): Promise<void> {
    await this.#activePanel()?.runAction(action);
  }

  // eslint-disable-next-line class-methods-use-this
  matchesViewType(viewType: string): boolean {
    return viewType === `mainThreadWebview-${WEBVIEW_MR_DIFF}`;
  }

  get repositoryRootForActiveTab(): string | undefined {
    return this.#activePanel()?.repositoryRoot;
  }

  /** What the active view shows, for commands run from its title bar. */
  activeTarget(): MrDiffTarget | undefined {
    return this.#activePanel()?.target;
  }

  /** Brings every open view of the merge request up to date after it changed elsewhere. */
  refreshPanelsFor(mr: RestMr): void {
    this.#panels.forEach(p => {
      if (p.target.mr.id === mr.id) p.refresh().catch(handleError);
    });
  }

  #activePanel(): MrDiffPanel | undefined {
    return [...this.#panels.values()].find(p => p.panel.active);
  }
}

export const mrDiffPanelController = new MrDiffPanelController();
