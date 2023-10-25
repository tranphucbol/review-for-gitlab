import * as vscode from 'vscode';
import { generateSecret } from '../generate_secret';
import { mapValues, update } from 'lodash';

const webviewResourcePaths = {
  appScriptUri: 'assets/app.js',
  styleUri: 'assets/index.css',
} as const;

const imageResourcesPaths = {
  emptyStateIconUri: 'assets/empty-activity-md.svg',
} as const;

const iconsPath = 'assets/icons.svg';

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
  resources: Record<string, string>,
) => {
  return mapValues(resources, path => getWebviewUri(path, webview, context, webviewKey));
};

/**
 * Prepares a JavaScript resource by updating the URIs of certain assets.
 * @param webview - The webview instance.
 * @param context - The extension context.
 * @param webviewKey - The key identifying the webview.
 * @returns A promise that resolves when the resource is prepared.
 */
export const prepareJavascriptResource = async (
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  webviewKey: string,
): Promise<void> => {
  const { emptyStateIconUri } = getWebviewResources(
    webview,
    context,
    webviewKey,
    imageResourcesPaths,
  );

  const fileUri = vscode.Uri.joinPath(
    context.extensionUri,
    'webviews',
    webviewKey,
    webviewResourcePaths.appScriptUri,
  );
  const contentArray = await vscode.workspace.fs.readFile(fileUri);
  const fileContent = new TextDecoder().decode(contentArray);

  const updatedContent = fileContent
    .replace(/\/gitlab_duo_chat\/assets\/icons\.svg/g, '') // this is to make sure we reference icons only with hashes, without the file path
    .replace(/\/gitlab_duo_chat\/assets\/empty-activity-md\.svg/g, emptyStateIconUri.toString());

  return await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(updatedContent));
};

/**
 * Asynchronously retrieves the content of an SVG file located at the `iconsPath`
 * within the extension's `webviews` directory, and returns the content as a string.
 *
 * This function leverages the VS Code's FileSystem API to read the file.
 *
 * @param {vscode.ExtensionContext} context - The extension context.
 *
 * @param {string} webviewKey - The key identifying the webview.
 *
 * @returns {Promise<string>} A promise that resolves to a string containing the content
 * of the SVG file, or rejects if an error occurs during file read.
 */
export const getIconsSvgContent = async (
  context: vscode.ExtensionContext,
  webviewKey: string,
): Promise<string> => {
  const svgIconsUri = vscode.Uri.joinPath(context.extensionUri, 'webviews', webviewKey, iconsPath);
  const svgContentArray = await vscode.workspace.fs.readFile(svgIconsUri);
  return new TextDecoder().decode(svgContentArray);
};

export const prepareWebviewSource = async (
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  webviewKey: string,
): Promise<string> => {
  await prepareJavascriptResource(webview, context, webviewKey);
  const nonce = generateSecret();

  const { appScriptUri, styleUri } = getWebviewResources(
    webview,
    context,
    webviewKey,
    webviewResourcePaths,
  );
  const svgFileContent = await getIconsSvgContent(context, webviewKey);

  const fileUri = vscode.Uri.joinPath(context.extensionUri, 'webviews', webviewKey, 'index.html');
  const contentArray = await vscode.workspace.fs.readFile(fileUri);
  const fileContent = new TextDecoder().decode(contentArray);

  return fileContent
    .replace(/{{svg}}/, svgFileContent)
    .replace(/{{nonce}}/gm, nonce)
    .replace(/<script /g, `<script nonce="${nonce}" `)
    .replace(`/${webviewKey}/${webviewResourcePaths.styleUri}`, styleUri.toString())
    .replace(`/${webviewKey}/${webviewResourcePaths.appScriptUri}`, appScriptUri.toString());
};
