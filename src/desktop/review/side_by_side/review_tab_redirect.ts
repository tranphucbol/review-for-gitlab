import * as vscode from 'vscode';
import { handleError } from '../../../common/errors/handle_error';
import { REVIEW_URI_SCHEME } from '../../constants';

/** how long an opened review tab waits for its editor before it is left alone */
const EDITOR_WAIT_MS = 1000;

/** how long a thread on the first line waits for a selection that never comes */
const SELECTION_WAIT_MS = 500;

export type OpenSideBySide = (uri: vscode.Uri, line: number) => Promise<void>;

/** review files the extension opens on purpose in a plain editor, such as Go to Source */
const expectedUris = new Set<string>();

/** Lets the next plain editor of `uri` stay open instead of turning into the side-by-side view. */
export const expectPlainReviewEditor = (uri: vscode.Uri): void => {
  const key = uri.toString();
  expectedUris.add(key);
  // a tab that was open already opens no new one, so the announcement must not linger
  setTimeout(() => expectedUris.delete(key), EDITOR_WAIT_MS);
};

const plainReviewUri = (tab: vscode.Tab): vscode.Uri | undefined => {
  const { input } = tab;
  return input instanceof vscode.TabInputText && input.uri.scheme === REVIEW_URI_SCHEME
    ? input.uri
    : undefined;
};

const findEditor = (uri: vscode.Uri) =>
  vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());

/** Resolves with the first value `check` finds, on `event` or right away, or undefined after `ms`. */
const waitFor = <T>(
  event: vscode.Event<unknown>,
  check: () => T | undefined,
  ms: number,
): Promise<T | undefined> => {
  const found = check();
  if (found !== undefined) return Promise.resolve(found);
  return new Promise(resolve => {
    const subscriptions: { dispose(): void }[] = [];
    const done = (value: T | undefined) => {
      subscriptions.forEach(s => s.dispose());
      resolve(value);
    };
    subscriptions.push(
      event(() => {
        const value = check();
        if (value !== undefined) done(value);
      }),
    );
    const timer = setTimeout(() => done(undefined), ms);
    subscriptions.push({ dispose: () => clearTimeout(timer) });
  });
};

/** The 1-based line the Comments panel revealed in the editor VS Code opens with the tab. */
const revealedLine = async (uri: vscode.Uri): Promise<number> => {
  const editor = await waitFor(
    vscode.window.onDidChangeVisibleTextEditors,
    () => findEditor(uri),
    EDITOR_WAIT_MS,
  );
  if (!editor) return 1;
  // the editor is shown at the top first and moved to the thread a moment later
  const line = await waitFor(
    vscode.window.onDidChangeTextEditorSelection,
    () => (editor.selection.active.line > 0 ? editor.selection.active.line : undefined),
    SELECTION_WAIT_MS,
  );
  return (line ?? 0) + 1;
};

/**
 * fork-only, see docs/decisions/020: the native diff is gone, but VS Code still opens a review
 * file in a plain editor when the Comments panel reveals one of its threads. Such a tab is
 * replaced by the side-by-side view on the thread's line. A diff tab is left alone, and so is
 * a tab that `expectPlainReviewEditor` announced.
 */
export const registerReviewTabRedirect = (openSideBySide: OpenSideBySide): vscode.Disposable =>
  vscode.window.tabGroups.onDidChangeTabs(({ opened }) => {
    opened.forEach(tab => {
      const uri = plainReviewUri(tab);
      if (!uri) return;
      if (expectedUris.delete(uri.toString())) return;
      const redirect = async () => {
        const line = await revealedLine(uri);
        // if the view can't open, the comment stays readable where VS Code put it
        await openSideBySide(uri, line);
        // the tab may have moved or closed meanwhile; close what is open now
        const stillOpen = vscode.window.tabGroups.all
          .flatMap(group => group.tabs)
          .filter(t => plainReviewUri(t)?.toString() === uri.toString());
        if (stillOpen.length) await vscode.window.tabGroups.close(stillOpen);
      };
      redirect().catch(handleError);
    });
  });
