import * as path from 'path';
import * as vscode from 'vscode';
import assert from 'assert';
import { handleError } from '../../../common/errors/handle_error';
import { log } from '../../../common/log';
import { VS_COMMANDS } from '../../command_names';
import { getAddedLinesForFile } from '../../git/diff_line_count';
import { getFileContent } from '../../git/get_file_content';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { gitlabProjectRepository } from '../../gitlab/gitlab_project_repository';
import { isUnauthorized } from '../../gitlab/is_unauthorized';
import { getJiraLinkConfig } from '../../jira/jira_keys';
import { mrCache } from '../../gitlab/mr_cache';
import { ProjectInRepository } from '../../gitlab/new_project';
import { UnsupportedVersionError } from '../../errors/unsupported_version_error';
import { UserFriendlyError } from '../../errors/user_friendly_error';
import { getBaseAndHeadUri } from '../../tree_view/items/changed_file_item';
import { getMentionCandidates } from '../../mentions/mention_candidates';
import { makeHtmlLinksAbsolute } from '../../utils/make_html_links_absolute';
import { findFileInDiffs } from '../../utils/find_file_in_diffs';
import { READ_ONLY_VERSION_MESSAGE } from '../versions/mr_version_comparison';
import { mrProjectPath, toUploadError, uploadAttachments } from '../comment_attachment_provider';
import { buildDiffPosition } from '../diff_position';
import { loadTokenRules } from './color_theme_tokens';
import { getEditorFont } from './editor_font';
import { loadDiffKeybindings } from './diff_keybindings';
import { toComparisonDiscussions, toDiffDiscussions } from './diff_discussions';
import { LocalCodeNavigation } from './local_code_navigation';
import { HunkDirection, LocalHunkApplier, minimalEdit } from './local_hunk_applier';
import { getShowLocalChangeButtons, SHOW_LOCAL_CHANGE_BUTTONS } from './merge_request_diff_viewer';
import {
  BlockRange,
  CodeHover,
  CodeLocation,
  CodeRange,
  DiffAction,
  DiffFileModel,
  DiffSide,
  FromWebviewMessage,
  TokenRule,
  ToWebviewMessage,
} from './messages';
import { mapSourceRange } from './source_lines';

/** Two versions of the merge request compared, see docs/plans/013. */
export interface MrDiffComparison {
  /** the older head as its base and the newer head as its head */
  version: RestMrVersion;
  /** such as `v3 → v5` */
  label: string;
  rebased: boolean;
}

export interface MrDiffTarget {
  mr: RestMr;
  /** the latest version of the merge request, which new comments are positioned against */
  mrVersion: RestMrVersion;
  file: RestDiffFile;
  repositoryRoot: string;
  comparison?: MrDiffComparison;
}

/** The version whose base and head the panes show. */
export const shownVersion = ({ mrVersion, comparison }: MrDiffTarget): RestMrVersion =>
  comparison?.version ?? mrVersion;

/** The file in the latest version, if the right pane shows its head and new comments go there. */
const commentableFile = ({
  mrVersion,
  comparison,
  file,
}: MrDiffTarget): RestDiffFile | undefined => {
  if (!comparison) return file;
  if (comparison.version.head_commit_sha !== mrVersion.head_commit_sha) return undefined;
  return findFileInDiffs(mrVersion.diffs, { newPath: file.new_path });
};

const COMPARING_VERSIONS = 'Not available while comparing versions.';

/** what a successful `result` carries besides its `requestId` */
type ResultContent = Pick<
  Extract<ToWebviewMessage, { command: 'result' }>,
  'markdown' | 'html' | 'mentions' | 'mentionsError'
>;

interface NavigationAnswer {
  locations?: CodeLocation[];
  hover?: CodeHover;
}

const decode = (content: Uint8Array) => new TextDecoder().decode(content);

const isSameVersion = (a: RestMrVersion, b: RestMrVersion): boolean =>
  a.head_commit_sha === b.head_commit_sha &&
  a.base_commit_sha === b.base_commit_sha &&
  a.start_commit_sha === b.start_commit_sha;

/** global state key: whether the panes are row-aligned with hatched fillers */
export const ALIGNED_KEY = 'gitlab.mergeRequestDiff.aligned';

/** how long the view waits for edits to the local file to settle before comparing it again */
const LOCAL_STATE_DELAY_MS = 150;

/** how long the status bar confirms a change copied into or reverted in the local file */
const HUNK_MESSAGE_MS = 3000;

/** how long the status bar says that Go to Source selected the closest lines */
const SOURCE_MESSAGE_MS = 5000;

const APPROXIMATE_SOURCE =
  'The local file differs from the merge request; the closest lines are selected.';

const NO_LOCAL_SOURCE =
  "The file is not in your local repository; the merge request's version is open instead.";

/** Opens `uri` with `range` selected, in the middle of the editor unless it is already in view. */
const showRange = async (uri: vscode.Uri, range: CodeRange): Promise<void> => {
  const selection = new vscode.Selection(
    range.startLine - 1,
    range.startColumn - 1,
    range.endLine - 1,
    range.endColumn - 1,
  );
  const editor = await vscode.window.showTextDocument(uri, { selection });
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
};

const GENERIC_ERROR =
  'The request to GitLab failed. For more information, review the extension logs.';

/** The card that sent the request shows the message, the details go to the log. */
const toErrorMessage = (e: unknown): string =>
  e instanceof UserFriendlyError ? e.message.replace(/\s+/g, ' ').trim() : GENERIC_ERROR;

/**
 * A refused token needs the user, so it gets the notification other commands show. Any
 * other failure stays in the card and the log: a refresh runs on every visibility change.
 */
const reportUnauthorized = (e: unknown) => {
  if (isUnauthorized(e)) handleError(e as Error);
};

/** The largest side the view loads; a bigger file opens in the native diff instead. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** git's own test: a NUL byte in the first 8000 bytes makes a file binary */
const isBinary = (content: Uint8Array): boolean => content.subarray(0, 8000).includes(0);

/** the diff GitLab 13.12 sends for a binary file, in place of hunks */
const BINARY_DIFF = /^Binary files .* differ$/;

/** Reads the file at a commit from the local repository first and from the API otherwise. */
const readFileAtCommit = async (
  projectInRepository: ProjectInRepository,
  projectId: number,
  filePath: string,
  commit: string,
): Promise<Uint8Array> => {
  const local = await getFileContent(
    projectInRepository.pointer.repository.rawRepository,
    filePath,
    commit,
  );
  if (local) return local;
  const remote = await getGitLabService(projectInRepository).getFileContent(
    filePath,
    commit,
    projectId,
  );
  return new Uint8Array(remote);
};

export class MrDiffPanel {
  readonly panel: vscode.WebviewPanel;

  readonly repositoryRoot: string;

  #target: MrDiffTarget;

  readonly #projectInRepository: ProjectInRepository;

  #file?: Promise<DiffFileModel>;

  /** Counts the loads of `#file`; a write positioned against an older load is refused. */
  #generation = 0;

  #disposed = false;

  readonly #preferences: vscode.Memento;

  #discussionsRequest = 0;

  #applier?: LocalHunkApplier;

  #codeNavigation?: LocalCodeNavigation;

  #localStateTimer?: NodeJS.Timeout;

  readonly #disposables: vscode.Disposable[] = [];

  constructor(panel: vscode.WebviewPanel, target: MrDiffTarget, preferences: vscode.Memento) {
    this.panel = panel;
    this.#target = target;
    this.#preferences = preferences;
    this.repositoryRoot = target.repositoryRoot;
    this.#projectInRepository = gitlabProjectRepository.getProjectOrFail(target.repositoryRoot);
    this.#disposables.push(
      panel.webview.onDidReceiveMessage(message =>
        this.#onMessage(message as FromWebviewMessage).catch(e => handleError(e)),
      ),
    );
  }

  /**
   * Starts loading the file before the webview is ready. The webview asks for it with
   * `appReady`, which it also sends again if VS Code reloads it. The bundle is too large for
   * the two-second wait in `waitForWebview`.
   */
  start(): void {
    this.#reloadFile();
    this.#watchLocalFile();
  }

  /** The merge request, version and file the view shows. */
  get target(): MrDiffTarget {
    return this.#target;
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#localStateTimer) clearTimeout(this.#localStateTimer);
    this.#disposables.forEach(d => d.dispose());
  }

  /**
   * Shows the file at another version of the merge request, after new commits were pushed. The
   * webview starts over with the new file, as it does when VS Code reloads it.
   */
  async showVersion(target: MrDiffTarget): Promise<void> {
    if (isSameVersion(this.#target.mrVersion, target.mrVersion)) return;
    this.#target = target;
    this.#applier = undefined;
    this.#codeNavigation = undefined;
    const generation = this.#reloadFile();
    await this.#sendFile();
    // a newer version replaced this one while it loaded, and refreshes for itself
    if (generation !== this.#generation) return;
    await Promise.all([this.refreshLocalState(), this.refreshDiscussions()]);
  }

  #reloadFile(): number {
    this.#generation += 1;
    this.#file = this.#loadFile();
    this.#file.catch(e => log.error('Failed to load the file for the side-by-side diff.', e));
    return this.#generation;
  }

  /** Refuses a write whose lines were counted in a file the view no longer shows. */
  #assertCurrentGeneration(generation: number, retry: string): void {
    if (generation === this.#generation) return;
    throw new UserFriendlyError(
      `The merge request has a newer version. The view is loading it; ${retry} again there.`,
      new Error(`Generation ${generation} is stale, the panel is at ${this.#generation}`),
    );
  }

  /** The file in the latest version of the merge request, if that is not the version shown. */
  async #newerTarget(): Promise<MrDiffTarget | undefined> {
    const { mr, file } = this.#target;
    const { mrVersion } = await mrCache.reloadMr(mr, this.#projectInRepository);
    if (isSameVersion(this.#target.mrVersion, mrVersion)) return undefined;
    // a comparison keeps its two versions; only where new comments go changes
    if (this.#target.comparison) return { ...this.#target, mrVersion };
    const latestFile = mrVersion.diffs.find(d => d.new_path === file.new_path);
    if (!latestFile) {
      log.info(`The latest version of !${mr.iid} no longer changes ${file.new_path}.`);
      return undefined;
    }
    return { ...this.#target, mrVersion, file: latestFile };
  }

  /** Shows the latest version of the merge request, or refreshes the discussions if it is shown. */
  async refresh(): Promise<void> {
    let newer: MrDiffTarget | undefined;
    try {
      newer = await this.#newerTarget();
    } catch (e) {
      log.error("Couldn't check the merge request for a newer version.", e as Error);
      reportUnauthorized(e);
    }
    if (newer) await this.showVersion(newer);
    else await this.refreshDiscussions();
  }

  /** The working-tree file the arrows change, if the merge request keeps one inside the repository. */
  #localUri(): vscode.Uri | undefined {
    const { file, repositoryRoot } = this.#target;
    if (file.deleted_file) return undefined;
    const root = path.resolve(repositoryRoot);
    const filePath = path.resolve(root, file.new_path);
    return filePath.startsWith(`${root}${path.sep}`) ? vscode.Uri.file(filePath) : undefined;
  }

  #watchLocalFile(): void {
    const uri = this.#localUri();
    if (!uri) return;
    const onChange = (changed: vscode.Uri) => {
      if (changed.toString() === uri.toString()) this.#scheduleLocalState();
    };
    // the directory, not the file: a file name may contain glob characters
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(uri.fsPath)), '*'),
    );
    this.#disposables.push(
      watcher,
      watcher.onDidChange(onChange),
      watcher.onDidCreate(onChange),
      watcher.onDidDelete(onChange),
      vscode.workspace.onDidChangeTextDocument(e => onChange(e.document.uri)),
      vscode.workspace.onDidCloseTextDocument(document => onChange(document.uri)),
    );
  }

  #scheduleLocalState(): void {
    if (this.#localStateTimer) clearTimeout(this.#localStateTimer);
    this.#localStateTimer = setTimeout(
      () => this.refreshLocalState().catch(handleError),
      LOCAL_STATE_DELAY_MS,
    );
  }

  /** The local text including unsaved edits, `undefined` if the file does not exist. */
  static async #readLocalText(uri: vscode.Uri): Promise<string | undefined> {
    const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (open) return open.getText();
    try {
      return decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      return undefined;
    }
  }

  /** Tells the webview which arrows to show for the local file as it is now. */
  async refreshLocalState(): Promise<void> {
    const applier = await this.#localApplier();
    if (!applier) return;
    if (!getShowLocalChangeButtons() || this.#target.comparison) {
      await this.#post({
        command: 'localState',
        enabled: false,
        applicable: 'none',
        appliedBlockIds: [],
      });
      return;
    }
    const uri = this.#localUri();
    const { file } = this.#target;
    if (!uri || file.new_file) {
      let reason = 'The file is outside the local repository.';
      if (file.deleted_file) {
        reason = 'The merge request deletes this file, so there is no local file to change.';
      } else if (file.new_file) {
        reason = 'The merge request adds this file, so the view shows it alone, without arrows.';
      }
      await this.#post({
        command: 'localState',
        enabled: true,
        applicable: 'none',
        reason,
        appliedBlockIds: [],
      });
      return;
    }
    const state = applier.state(await MrDiffPanel.#readLocalText(uri));
    await this.#post({ command: 'localState', enabled: true, ...state });
  }

  /** `undefined` until the file has loaded, or if it failed to load. */
  async #localApplier(): Promise<LocalHunkApplier | undefined> {
    const file = await this.#file?.catch(() => undefined);
    if (!file) return undefined;
    this.#applier ??= new LocalHunkApplier(file.oldText, file.newText);
    return this.#applier;
  }

  /** `undefined` until the file has loaded, or if there is no local file to ask. */
  async #navigation(): Promise<LocalCodeNavigation | undefined> {
    const uri = this.#localUri();
    const file = await this.#file?.catch(() => undefined);
    if (!uri || !file) return undefined;
    this.#codeNavigation ??= new LocalCodeNavigation(uri, { old: file.oldText, new: file.newText });
    return this.#codeNavigation;
  }

  /** Navigation never shows an error: a failed request is an empty answer. */
  async #answerNavigation(
    requestId: number,
    ask: (navigation: LocalCodeNavigation) => Promise<NavigationAnswer>,
  ): Promise<void> {
    let answer: NavigationAnswer = {};
    try {
      const navigation = await this.#navigation();
      if (navigation) answer = await ask(navigation);
    } catch (e) {
      log.debug('Side-by-side code navigation failed.', e);
    }
    await this.#post({ ...answer, command: 'result', requestId });
  }

  /**
   * Copies one block into the local file as an unsaved edit that the user can undo. The
   * applier checks the whole file first; VS Code's change event then finds the file as the
   * applier expects it.
   */
  async #applyHunk(block: BlockRange, direction: HunkDirection): Promise<void> {
    if (this.#target.comparison) {
      throw new UserFriendlyError(
        COMPARING_VERSIONS,
        new Error('Local change buttons are off in a comparison'),
      );
    }
    if (!getShowLocalChangeButtons()) {
      throw new UserFriendlyError(
        `Turn on the ${SHOW_LOCAL_CHANGE_BUTTONS} setting to change the local file from this view.`,
        new Error('Local change buttons are off'),
      );
    }
    const uri = this.#localUri();
    const applier = await this.#localApplier();
    if (!uri || !applier || this.#target.file.new_file) {
      throw new UserFriendlyError(
        "The view can't change the local file.",
        new Error(`No local file for ${this.#target.file.new_path}`),
      );
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const current = document.getText();
    const next = applier.apply(current, block, direction);
    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const { start, end, text } = minimalEdit(current, next.replace(/\n/g, eol));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, new vscode.Range(document.positionAt(start), document.positionAt(end)), text);
    let applied = false;
    try {
      applied = await vscode.workspace.applyEdit(edit);
    } finally {
      if (!applied) applier.forget(block.blockId);
    }
    if (!applied) {
      throw new UserFriendlyError(
        "VS Code didn't change the local file.",
        new Error('workspace.applyEdit returned false'),
      );
    }
    const fileName = path.basename(uri.fsPath);
    vscode.window.setStatusBarMessage(
      direction === 'apply'
        ? `Copied the change into ${fileName}.`
        : `Reverted the change in ${fileName}.`,
      HUNK_MESSAGE_MS,
    );
  }

  /** Posts nothing if a newer load replaced the file meanwhile: that load posts its own `init`. */
  async #sendFile(): Promise<void> {
    assert(this.#file);
    const generation = this.#generation;
    let file: DiffFileModel;
    try {
      file = await this.#file;
    } catch (e) {
      if (generation !== this.#generation) return;
      await this.#post({
        command: 'error',
        message:
          e instanceof UserFriendlyError
            ? e.message
            : `The extension couldn't load ${this.#target.file.new_path} for this merge request.`,
      });
      return;
    }
    if (generation !== this.#generation) return;
    await this.#post({
      command: 'init',
      file,
      aligned: this.#preferences.get(ALIGNED_KEY, true),
      generation,
    });
  }

  async #loadFile(): Promise<DiffFileModel> {
    const { mr, file, comparison } = this.#target;
    const shown = shownVersion(this.#target);
    const latestFile = commentableFile(this.#target);
    const cannotShow = (reason: string) =>
      new UserFriendlyError(
        `The side-by-side diff can't show ${file.new_path}: ${reason}. Open the native diff instead.`,
        new Error(`${file.new_path} is not shown side by side: ${reason}`),
      );
    if (BINARY_DIFF.test(file.diff.trim())) throw cannotShow('it is a binary file');
    const read = async (filePath: string, commit: string) => {
      const content = await readFileAtCommit(
        this.#projectInRepository,
        mr.project_id,
        filePath,
        commit,
      );
      if (isBinary(content)) throw cannotShow('it is a binary file');
      if (content.byteLength > MAX_FILE_BYTES) throw cannotShow('it is larger than 2 MB');
      return decode(content);
    };
    const [oldText, newText] = await Promise.all([
      file.new_file ? '' : read(file.old_path, shown.base_commit_sha),
      file.deleted_file ? '' : read(file.new_path, shown.head_commit_sha),
    ]);
    const collapsed = file.diff === '' && oldText !== newText;
    return {
      oldPath: file.old_path,
      newPath: file.new_path,
      oldText,
      newText,
      oldExists: !file.new_file,
      newExists: !file.deleted_file,
      diff: file.diff,
      collapsed,
      commentableNewLines: latestFile?.diff
        ? getAddedLinesForFile(this.#target.mrVersion, file.new_path)
        : [],
      ...(comparison && { comparison: { label: comparison.label, rebased: comparison.rebased } }),
    };
  }

  /** Sends the syntax colours of the active theme; without them Monaco colours code its own way. */
  async refreshTokenTheme(): Promise<void> {
    let rules: TokenRule[] = [];
    try {
      rules = await loadTokenRules();
    } catch (e) {
      log.warn("Side-by-side diff couldn't resolve the syntax colours of the theme.", e as Error);
    }
    await this.#post({ command: 'tokenTheme', rules });
  }

  /** Sends the editor font settings, so the panes match the code editors. */
  async refreshEditorFont(): Promise<void> {
    await this.#post({ command: 'editorFont', font: getEditorFont() });
  }

  /** Sends the Jira link settings, so the notes link Jira issue keys. */
  async refreshJiraLinks(): Promise<void> {
    await this.#post({ command: 'jiraLinks', config: getJiraLinkConfig() ?? null });
  }

  /** Sends the keys the panes take over, so a rebound key works in them as in a diff editor. */
  async refreshKeybindings(): Promise<void> {
    await this.#post({ command: 'keybindings', keybindings: await loadDiffKeybindings() });
  }

  /** Runs a `gl.sideBySide*` command in this view. */
  async runAction(action: DiffAction): Promise<void> {
    await this.#post({ command: 'runAction', action });
  }

  /** Sends the discussions on this file; a response to an older request is dropped. */
  async refreshDiscussions(): Promise<void> {
    this.#discussionsRequest += 1;
    const request = this.#discussionsRequest;
    const { mr, mrVersion, file, comparison } = this.#target;
    const gitlabService = getGitLabService(this.#projectInRepository);
    let message: ToWebviewMessage;
    try {
      const [discussions, canComment] = await Promise.all([
        gitlabService.getDiscussions({ issuable: mr }),
        gitlabService.canUserCommentOnMr(mr),
      ]);
      message = {
        command: 'discussions',
        discussions: comparison
          ? toComparisonDiscussions(discussions, comparison.version, file)
          : toDiffDiscussions(discussions, mrVersion, file),
        canComment,
      };
    } catch (e) {
      if (e instanceof UnsupportedVersionError) {
        message = { command: 'discussions', discussions: [], canComment: false, unsupported: true };
      } else {
        log.error('Failed to load the discussions for the side-by-side diff.', e as Error);
        reportUnauthorized(e);
        message = {
          command: 'discussions',
          discussions: [],
          canComment: false,
          error: "The extension couldn't load the discussions of this merge request.",
        };
      }
    }
    if (request === this.#discussionsRequest) await this.#post(message);
  }

  /**
   * Runs a request from the webview and answers it with one `result` message. A write
   * refreshes the discussions first, so the webview replaces its draft with the saved note
   * in one step. `notify` decides which failures also get a notification.
   */
  async #respond(
    requestId: number,
    action: () => Promise<ResultContent | void>,
    refreshDiscussions = true,
    notify: (e: unknown) => void = reportUnauthorized,
  ): Promise<void> {
    try {
      const content = await action();
      if (refreshDiscussions) await this.refreshDiscussions();
      await this.#post({ command: 'result', requestId, ...content });
    } catch (e) {
      log.error('A side-by-side diff request failed.', e as Error);
      notify(e);
      await this.#post({ command: 'result', requestId, error: toErrorMessage(e) });
    }
  }

  async #createThread(
    generation: number,
    side: 'old' | 'new',
    line: number,
    body: string,
  ): Promise<void> {
    this.#assertCurrentGeneration(generation, 'comment');
    const { mr, mrVersion } = this.#target;
    const file = commentableFile(this.#target);
    if (!file || (this.#target.comparison && side === 'old')) {
      throw new UserFriendlyError(
        READ_ONLY_VERSION_MESSAGE,
        new Error(`No new comments on the ${side} side of ${this.#target.comparison?.label}`),
      );
    }
    if (file.diff === '') {
      throw new UserFriendlyError(
        "GitLab didn't return a diff for this file because it is too large, so it doesn't accept new comments on it.",
        new Error(`Empty diff for ${file.new_path}`),
      );
    }
    await getGitLabService(this.#projectInRepository).createDiffNote(
      mr.id,
      body,
      buildDiffPosition(mrVersion, file, side, line),
    );
  }

  /** The comment is saved in the merge request's project, so its references resolve there. */
  async #previewMarkdown(body: string): Promise<string> {
    const { mr } = this.#target;
    try {
      const html = await getGitLabService(this.#projectInRepository).renderMarkdown(body, {
        namespaceWithPath: mrProjectPath(mr),
      });
      return makeHtmlLinksAbsolute(html ?? '', this.#projectInRepository.account.instanceUrl);
    } catch (e) {
      throw new UserFriendlyError("GitLab couldn't render the preview.", e as Error);
    }
  }

  async #uploadImage(name: string, contentType: string, base64: string): Promise<string> {
    const { mr } = this.#target;
    const mrContext = { mr, projectInRepository: this.#projectInRepository };
    try {
      return await uploadAttachments(mrContext, [
        { name, contentType, read: async () => new Uint8Array(Buffer.from(base64, 'base64')) },
      ]);
    } catch (e) {
      throw toUploadError(mr, e as Error);
    }
  }

  async #onMessage(message: FromWebviewMessage): Promise<void> {
    const { mr } = this.#target;
    const gitlabService = () => getGitLabService(this.#projectInRepository);
    switch (message.command) {
      case 'appReady':
        await this.refreshEditorFont();
        await this.refreshTokenTheme();
        await this.refreshJiraLinks();
        await this.refreshKeybindings();
        await this.#sendFile();
        await Promise.all([this.refreshLocalState(), this.refreshDiscussions()]);
        break;
      case 'refresh':
        await this.refresh();
        break;
      case 'setAligned':
        await this.#preferences.update(ALIGNED_KEY, message.aligned);
        break;
      case 'openNative':
        await this.openNativeDiff();
        break;
      case 'createThread':
        await this.#respond(message.requestId, () =>
          this.#createThread(message.generation, message.side, message.line, message.body),
        );
        break;
      case 'reply':
        await this.#respond(message.requestId, async () => {
          await gitlabService().createNote(mr, message.body, message.discussionId);
        });
        break;
      case 'editNote':
        await this.#respond(message.requestId, () =>
          gitlabService().updateNoteBody(message.noteId, message.body, message.originalBody, mr),
        );
        break;
      case 'deleteNote':
        await this.#respond(message.requestId, () => gitlabService().deleteNote(message.noteId));
        break;
      case 'setResolved':
        await this.#respond(message.requestId, () =>
          gitlabService().setResolved(message.discussionId, message.resolved),
        );
        break;
      case 'uploadImage':
        await this.#respond(
          message.requestId,
          async () => ({
            markdown: await this.#uploadImage(message.name, message.contentType, message.base64),
          }),
          false,
          // as in the native comment box, a failed upload is a notification; the card marks the draft
          e => handleError(e as Error),
        );
        break;
      case 'previewMarkdown':
        await this.#respond(
          message.requestId,
          async () => ({ html: await this.#previewMarkdown(message.body) }),
          false,
        );
        break;
      case 'searchMentions':
        await this.#respond(
          message.requestId,
          async () => {
            const { mentions, error } = await getMentionCandidates(
              gitlabService(),
              mr,
              message.query,
            );
            return { mentions, mentionsError: error };
          },
          false,
        );
        break;
      case 'applyHunk': {
        const { blockId, oldStart, oldCount, newStart, newCount } = message;
        await this.#respond(
          message.requestId,
          async () => {
            try {
              this.#assertCurrentGeneration(message.generation, 'change the file');
              await this.#applyHunk(
                { blockId, oldStart, oldCount, newStart, newCount },
                message.direction,
              );
            } finally {
              // the arrows change before the result arrives, so none flicker back
              await this.refreshLocalState();
            }
          },
          false,
        );
        break;
      }
      case 'definitions':
        await this.#answerNavigation(message.requestId, async navigation => ({
          locations: await navigation.definitions(message),
        }));
        break;
      case 'references':
        await this.#answerNavigation(message.requestId, async navigation => ({
          locations: await navigation.references(message),
        }));
        break;
      case 'hover':
        await this.#answerNavigation(message.requestId, async navigation => {
          const hover = await navigation.hover(message);
          return hover ? { hover } : {};
        });
        break;
      case 'openLocation':
        await (await this.#navigation())?.open(message.uri, message.line, message.column);
        break;
      case 'openSource': {
        const { generation, side, startLine, startColumn, endLine, endColumn } = message;
        await this.#openSource(generation, side, { startLine, startColumn, endLine, endColumn });
        break;
      }
      default:
        break;
    }
  }

  /**
   * Opens the local file on the lines that hold the `range` of the `side` pane, found by
   * their content, so they open right after the checkout moved on. Without a local file the
   * merge request's own version of that side opens instead.
   */
  async #openSource(generation: number, side: DiffSide, range: CodeRange): Promise<void> {
    this.#assertCurrentGeneration(generation, 'go to the source');
    const file = await this.#file;
    assert(file);
    const uri = this.#localUri();
    const localText = uri && (await MrDiffPanel.#readLocalText(uri));
    if (uri && localText !== undefined) {
      const mapped = mapSourceRange(side === 'old' ? file.oldText : file.newText, localText, range);
      await showRange(uri, mapped.range);
      if (!mapped.exact) vscode.window.setStatusBarMessage(APPROXIMATE_SOURCE, SOURCE_MESSAGE_MS);
      return;
    }
    const { mr, mrVersion, repositoryRoot, comparison } = this.#target;
    const { baseFileUri, headFileUri } = getBaseAndHeadUri(
      mr,
      shownVersion(this.#target),
      this.#target.file,
      repositoryRoot,
      comparison && mrVersion,
    );
    await showRange(side === 'old' ? baseFileUri : headFileUri, range);
    // resolves only when dismissed
    vscode.window.showInformationMessage(NO_LOCAL_SOURCE).then(undefined, handleError);
  }

  async openNativeDiff(): Promise<void> {
    const { mr, mrVersion, file, repositoryRoot, comparison } = this.#target;
    const { baseFileUri, headFileUri } = getBaseAndHeadUri(
      mr,
      shownVersion(this.#target),
      file,
      repositoryRoot,
      comparison && mrVersion,
    );
    const suffix = comparison ? ` ${comparison.label}` : '';
    await vscode.commands.executeCommand(
      VS_COMMANDS.DIFF,
      baseFileUri,
      headFileUri,
      `${path.basename(file.new_path)} (!${mr.iid}${suffix})`,
    );
  }

  async #post(message: ToWebviewMessage): Promise<void> {
    if (this.#disposed) return;
    await this.panel.webview.postMessage(message);
  }
}
