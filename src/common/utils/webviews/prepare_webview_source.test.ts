import * as vscode from 'vscode';
import * as helpers from './prepare_webview_source';

jest.mock('vscode');
jest.mock('../generate_secret', () => ({
  generateSecret: jest.fn().mockReturnValue('123'),
}));

describe('helpers', () => {
  let context: vscode.ExtensionContext;
  let webview: vscode.Webview;
  const webviewKey = 'gitlab_duo_chat';

  beforeEach(() => {
    context = {
      extensionUri: vscode.Uri.file('/foo/bar'),
    } as Partial<vscode.ExtensionContext> as vscode.ExtensionContext;
    webview = {
      asWebviewUri: jest.fn().mockImplementation(url => url),
    } as Partial<vscode.Webview> as vscode.Webview;
  });

  describe('prepareWebviewSource', () => {
    const inputSource = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="img-src vscode-resource: data: https:; script-src 'nonce-{{nonce}}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GitLab Workflow</title>
        <script crossorigin type="module" src="/gitlab_duo_chat/assets/app.js"></script>
        <link rel="stylesheet" href="/gitlab_duo_chat/assets/index.css">
        {{svg}}
      </head>
      <body>
        <div id="app"></div>
      </body>
    </html>
    `;

    const expectedHTML = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="img-src vscode-resource: data: https:; script-src 'nonce-123';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GitLab Workflow</title>
        <script nonce="123" crossorigin type="module" src="file:///foo/bar/webviews/gitlab_duo_chat/assets/app.js"></script>
        <link rel="stylesheet" href="file:///foo/bar/webviews/gitlab_duo_chat/assets/index.css">
        <svg>...</svg>
      </head>
      <body>
        <div id="app"></div>
      </body>
    </html>
    `;

    beforeEach(() => {
      jest
        .mocked(vscode.workspace.fs.readFile)
        .mockResolvedValue(new TextEncoder().encode(inputSource));
    });

    it('returns WebView source with inserted nonce and assets', async () => {
      // spy on dependencies
      const prepareJavascriptResourceSpy = jest.spyOn(helpers, 'prepareJavascriptResource');
      const getIconsSvgContentSpy = jest.spyOn(helpers, 'getIconsSvgContent');

      // mock implementations
      prepareJavascriptResourceSpy.mockResolvedValue();
      getIconsSvgContentSpy.mockResolvedValue('<svg>...</svg>');

      const result = await helpers.prepareWebviewSource(webview, context, webviewKey);

      expect(result).toStrictEqual(expectedHTML);
      prepareJavascriptResourceSpy.mockRestore();
      getIconsSvgContentSpy.mockRestore();
    });

    it('handles errors', async () => {
      jest.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('Boom!'));

      await expect(helpers.prepareWebviewSource(webview, context, webviewKey)).rejects.toThrow(
        'Boom!',
      );
    });
  });

  describe('getIconsSvgContent', () => {
    it('reads SVG content', async () => {
      const svgContent = '<svg>...</svg>';
      jest
        .mocked(vscode.workspace.fs.readFile)
        .mockResolvedValue(new TextEncoder().encode(svgContent));

      const result = await helpers.getIconsSvgContent(context, webviewKey);

      expect(result).toBe(svgContent);
    });
  });

  describe('prepareJavascriptResource', () => {
    const newEmptyStateUri = vscode.Uri.parse('test://empty-state');
    const inputSource = `
      import emptyStateIcon from '/gitlab_duo_chat/assets/empty-activity-md.svg';
      import icons from '/gitlab_duo_chat/assets/icons.svg';
    `;
    const expectedResultJS = `
      import emptyStateIcon from '${newEmptyStateUri}';
      import icons from '';
    `;

    beforeEach(() => {
      jest
        .mocked(vscode.workspace.fs.readFile)
        .mockResolvedValue(new TextEncoder().encode(inputSource));
    });

    it('replaces image URIs in the script', async () => {
      jest.mocked(webview.asWebviewUri).mockReturnValue(newEmptyStateUri);

      await helpers.prepareJavascriptResource(webview, context, webviewKey);

      expect(vscode.workspace.fs.writeFile).toBeCalledWith(
        expect.any(vscode.Uri),
        new TextEncoder().encode(expectedResultJS),
      );
    });
  });
});
