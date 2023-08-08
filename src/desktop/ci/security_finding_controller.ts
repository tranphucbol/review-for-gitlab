import { promises as fs } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import assert from 'assert';
import { WEBVIEW_SECURITY_FINDING } from '../constants';
import { GqlSecurityFinding } from '../gitlab/security_findings/api/get_security_finding_report';

export type SecurityFindingWebviewPanel = vscode.WebviewPanel & {
  finding: GqlSecurityFinding;
};

export class SecurityFindingWebviewController {
  async init(context: vscode.ExtensionContext) {
    this.#context = context;

    this.#htmlContent = await fs.readFile(
      path.join(this.#context.extensionPath, 'webviews/security_finding.html'),
      'utf-8',
    );
  }

  #context?: vscode.ExtensionContext;

  #panel?: SecurityFindingWebviewPanel;

  #htmlContent = '';

  #createEmptyPanel(): SecurityFindingWebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      WEBVIEW_SECURITY_FINDING,
      '',
      vscode.ViewColumn.Active,
      {},
    ) as SecurityFindingWebviewPanel;

    this.#panel = panel;

    panel.onDidDispose(() => {
      if (this.#panel === panel) {
        this.#panel = undefined;
      }
    });

    return panel;
  }

  createOrUpdateWebview(
    finding: GqlSecurityFinding,
    existingPanel?: SecurityFindingWebviewPanel,
  ): SecurityFindingWebviewPanel {
    assert(this.#context);
    const { title, description, severity } = finding;
    const panel = existingPanel ?? this.#createEmptyPanel();

    panel.title = title;
    panel.finding = finding;

    panel.webview.html = this.#htmlContent
      .replace('{{title}}', title)
      .replace('{{description}}', description)
      .replace('{{severity}}', severity);
    return panel;
  }

  open(item: GqlSecurityFinding): SecurityFindingWebviewPanel {
    const panel = this.createOrUpdateWebview(item, this.#panel);
    panel.reveal();
    return panel;
  }
}

export const securityFindingWebviewController = new SecurityFindingWebviewController();
