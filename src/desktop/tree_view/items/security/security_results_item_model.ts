import * as vscode from 'vscode';
import { ItemModel } from '../item_model';

import { GqlSecurityFindingReport } from '../../../gitlab/graphql/get_security_finding_report';
import { SecurityFindingsGroupItem } from './security_findings_group_item';

export type SecurityResultsType = 'NO_SCANS_FOUND' | 'RUNNING' | 'COMPLETE';

export class SecurityResultsItemModel extends ItemModel {
  readonly #securityReport?: GqlSecurityFindingReport;

  readonly #securityResultsType: SecurityResultsType;

  constructor(securityResultsType: SecurityResultsType, securityReport?: GqlSecurityFindingReport) {
    super();
    this.#securityReport = securityReport;
    this.#securityResultsType = securityResultsType;
  }

  getTreeItem(): vscode.TreeItem {
    if (this.#securityResultsType === 'NO_SCANS_FOUND') {
      return new vscode.TreeItem('No scans found');
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

      if (addedSecurityFindings.nodes.length > 0) {
        securityFindingGroups.push(new SecurityFindingsGroupItem('ADDED', addedSecurityFindings));
      }
      if (fixedSecurityFindings.nodes.length > 0) {
        securityFindingGroups.push(new SecurityFindingsGroupItem('FIXED', fixedSecurityFindings));
      }
    }

    return securityFindingGroups;
  }
}
