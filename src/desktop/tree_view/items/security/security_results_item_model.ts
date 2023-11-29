import * as vscode from 'vscode';
import { ItemModel } from '../item_model';

import { GqlSecurityFindingReport } from '../../../gitlab/security_findings/api/get_security_finding_report';
import { SecurityFindingsGroupItem } from './security_findings_group_item';
import { ProjectInRepository } from '../../../gitlab/new_project';

export type SecurityResultsType = 'NO_SCANS_FOUND' | 'RUNNING' | 'COMPLETE';

export class SecurityResultsItemModel extends ItemModel {
  readonly #securityReport?: GqlSecurityFindingReport;

  readonly #securityResultsType: SecurityResultsType;

  readonly #projectInRepository: ProjectInRepository;

  constructor(
    projectInRepository: ProjectInRepository,
    securityResultsType: SecurityResultsType,
    securityReport?: GqlSecurityFindingReport,
  ) {
    super();
    this.#securityReport = securityReport;
    this.#securityResultsType = securityResultsType;
    this.#projectInRepository = projectInRepository;
  }

  getTreeItem(): vscode.TreeItem {
    if (this.#securityResultsType === 'NO_SCANS_FOUND') {
      return new vscode.TreeItem('No security scans found');
    }

    const description = this.#securityResultsType === 'RUNNING' ? 'In progress' : 'Complete';

    const item = new vscode.TreeItem('Security scanning', vscode.TreeItemCollapsibleState.Expanded);
    item.description = description;
    item.iconPath = new vscode.ThemeIcon('shield');
    return item;
  }

  async getChildren(): Promise<ItemModel[]> {
    const securityFindingGroups: ItemModel[] = [];

    if (this.#securityReport) {
      const addedSecurityFindings = this.#securityReport.added;
      const fixedSecurityFindings = this.#securityReport.fixed;

      securityFindingGroups.push(
        new SecurityFindingsGroupItem('ADDED', addedSecurityFindings, this.#projectInRepository),
      );
      securityFindingGroups.push(
        new SecurityFindingsGroupItem('FIXED', fixedSecurityFindings, this.#projectInRepository),
      );
    }

    return securityFindingGroups;
  }
}
