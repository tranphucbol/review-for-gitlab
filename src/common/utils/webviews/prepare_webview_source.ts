import * as vscode from 'vscode';
import { generateSecret } from '../generate_secret';
import { mapValues } from 'lodash';

const webviewResourcePaths = {
  appScriptUri: 'assets/app.js',
  styleUri: 'assets/index.css',
} as const;

type WebviewResources = Record<keyof typeof webviewResourcePaths, vscode.Uri>;

const getWebviewUri = (
  path: string,
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  webviewKey: string,
): vscode.Uri => {
  const segments = path.split('/');
  const uri = vscode.Uri.joinPath(context.extensionUri, 'webviews', webviewKey, ...segments);

  return webview.asWebviewUri(uri);
};

const getWebviewResources = (
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  webviewKey: string,
) => {
  return mapValues(webviewResourcePaths, path => getWebviewUri(path, webview, context, webviewKey));
};

export const prepareWebviewSource = async (
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  webviewKey: string,
): Promise<string> => {
  const nonce = generateSecret();

  const { appScriptUri, styleUri } = getWebviewResources(webview, context, webviewKey);
  const fileUri = vscode.Uri.joinPath(context.extensionUri, 'webviews', webviewKey, 'index.html');
  const contentArray = await vscode.workspace.fs.readFile(fileUri);
  const fileContent = new TextDecoder().decode(contentArray);

  return fileContent
    .replace(/{{nonce}}/gm, nonce)
    .replace(/<script /g, `<script nonce="${nonce}" `)
    .replace(`/${webviewKey}/${webviewResourcePaths.styleUri}`, styleUri.toString())
    .replace(`/${webviewKey}/${webviewResourcePaths.appScriptUri}`, appScriptUri.toString());
};
