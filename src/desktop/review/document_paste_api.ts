import * as vscode from 'vscode';

/**
 * `DocumentPasteEditProvider` only became stable VS Code API in 1.97. This extension
 * supports older VS Code versions (see `engines.vscode` in `package.json`) and it is
 * compiled against the matching older `@types/vscode`. That's why we declare the parts
 * of the API that we use and check whether they exist at runtime.
 *
 * https://code.visualstudio.com/api/references/vscode-api#DocumentPasteEditProvider
 */
export interface PasteEditKind {
  readonly value: string;
  append(...parts: string[]): PasteEditKind;
}

export interface PasteEdit {
  title: string;
  kind: PasteEditKind;
  insertText: string | vscode.SnippetString;
}

export interface PasteEditContext {
  readonly only?: PasteEditKind;
  readonly triggerKind: number;
}

export interface PasteEditProvider {
  provideDocumentPasteEdits(
    document: vscode.TextDocument,
    ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    context: PasteEditContext,
    token: vscode.CancellationToken,
  ): Promise<PasteEdit[] | undefined>;
}

interface PasteEditProviderMetadata {
  readonly providedPasteEditKinds: readonly PasteEditKind[];
  readonly pasteMimeTypes?: readonly string[];
}

interface VsCodePasteApi {
  languages?: {
    registerDocumentPasteEditProvider?: (
      selector: vscode.DocumentSelector,
      provider: PasteEditProvider,
      metadata: PasteEditProviderMetadata,
    ) => vscode.Disposable;
  };
  DocumentPasteEdit?: new (
    insertText: string | vscode.SnippetString,
    title: string,
    kind: PasteEditKind,
  ) => PasteEdit;
  /** VS Code 1.98 and later */
  DocumentDropOrPasteEditKind?: { Empty: PasteEditKind };
  /** VS Code 1.97 */
  DocumentPasteEditKind?: { Empty: PasteEditKind };
}

export interface DocumentPasteApi {
  createKind(...parts: string[]): PasteEditKind;
  createEdit(insertText: string, title: string, kind: PasteEditKind): PasteEdit;
  registerProvider(
    selector: vscode.DocumentSelector,
    provider: PasteEditProvider,
    metadata: PasteEditProviderMetadata,
  ): vscode.Disposable;
}

/** Returns `undefined` when the running VS Code doesn't support the paste edit API. */
export const getDocumentPasteApi = (): DocumentPasteApi | undefined => {
  const api = vscode as VsCodePasteApi;
  const register = api.languages?.registerDocumentPasteEditProvider;
  const PasteEditConstructor = api.DocumentPasteEdit;
  const emptyKind = (api.DocumentDropOrPasteEditKind ?? api.DocumentPasteEditKind)?.Empty;

  if (!register || !PasteEditConstructor || !emptyKind) return undefined;

  return {
    createKind: (...parts) => emptyKind.append(...parts),
    createEdit: (insertText, title, kind) => new PasteEditConstructor(insertText, title, kind),
    registerProvider: (selector, provider, metadata) =>
      register.call(vscode.languages, selector, provider, metadata),
  };
};
