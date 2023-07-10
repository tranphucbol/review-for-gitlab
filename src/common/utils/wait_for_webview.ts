import { Webview } from 'vscode';

export const waitForWebview = async (webview: Webview) => {
  await new Promise<void>(resolve => {
    const sub = webview.onDidReceiveMessage(async message => {
      if (message.command === 'appReady') {
        sub.dispose();
        resolve();
      }
    });
  });
};
