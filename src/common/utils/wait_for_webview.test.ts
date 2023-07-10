import * as vscode from 'vscode';
import { waitForWebview } from './wait_for_webview';

describe('waitForWebview', () => {
  let mockWebview: vscode.Webview;
  let disposable: vscode.Disposable;

  beforeEach(() => {
    disposable = {
      dispose: jest.fn(),
    };

    mockWebview = {
      onDidReceiveMessage: jest.fn().mockImplementation(callback => {
        setTimeout(() => {
          callback({ command: 'appReady' });
        }, 0);
        return disposable;
      }),
    } as Partial<vscode.Webview> as vscode.Webview;
  });

  it('waits until webView sends appReady message', async () => {
    await waitForWebview(mockWebview);
    expect(disposable.dispose).toHaveBeenCalled();
  });
});
