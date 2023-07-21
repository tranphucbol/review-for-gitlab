const vscode = require('vscode');
const EventEmitter = require('events');

/*
  This class replaces the mechanism that the webviews use for sending messages between
  the extension and the webview. This is necessary since we can't control the webview and so
  we need to be able to simulate events triggered by the webview and see that the extension
  handles them well.
  */
class WebviewMock {
  #eventEmitter;

  #sandbox;

  constructor(sandbox) {
    this.#eventEmitter = new EventEmitter();
    this.#sandbox = sandbox;
    this.webview = this.#createWebview();
  }

  mockNextWebView() {
    const stub = this.#sandbox.stub(vscode.window, 'createWebviewPanel').callsFake(() => {
      stub.restore();
      return this.webview;
    });
  }

  async emulateViewMessage(message) {
    await this.#eventEmitter.emit('', message);
  }

  async waitForMessage(matchFunc) {
    return new Promise(resolve => {
      const sub = this.webview.webview.onDidReceiveMessage(message => {
        if (!matchFunc(message)) return;
        sub.dispose();
        resolve(message);
      });
    });
  }

  postMessage(message) {
    this.webview.webview.postMessage(message);
  }

  #createWebview() {
    const webview = vscode.window.createWebviewPanel(
      'webviewMock',
      'WebView Mock',
      vscode.ViewColumn.One,
    );
    webview.show = () => {};

    this.#sandbox.stub(webview.webview, 'postMessage').callsFake(message => {
      this.#eventEmitter.emit('', message);
    });
    this.#sandbox.stub(webview.webview, 'onDidReceiveMessage').callsFake(listener => {
      this.#eventEmitter.on('', listener);
      return { dispose: () => {} };
    });

    setTimeout(() => this.emulateViewMessage({ command: 'appReady' }), 10);

    return webview;
  }
}

module.exports = {
  WebviewMock,
};
