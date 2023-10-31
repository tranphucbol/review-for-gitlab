import * as vscode from 'vscode';
import { ItemModel } from '../item_model';

import { GqlSecurityFinding } from '../../../gitlab/security_findings/api/get_security_finding_report';
import { SecurityFindingItem } from './security_finding_item';
import { severityToIcon, Severity } from './severity_to_icon';
import { ProjectInRepository } from '../../../gitlab/new_project';

export class SecurityFindingSeverityGroup extends ItemModel {
  readonly #findings: GqlSecurityFinding[];

  readonly #severity: Severity;

  readonly projectInRepository: ProjectInRepository;

  constructor(
    findings: GqlSecurityFinding[],
    severity: Severity,
    projectInRepository: ProjectInRepository,
  ) {
    super();
    this.#severity = severity;
    this.#findings = findings;
    this.projectInRepository = projectInRepository;
  }

  getTreeItem(): vscode.TreeItem {
    const title = `${this.#findings.length} ${this.#severity.toLowerCase()} severity`;

    const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = severityToIcon(this.#severity);

    return item;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    return this.#findings.map(
      finding => new SecurityFindingItem(finding, this.#severity, this.projectInRepository),
    );
  }
}
