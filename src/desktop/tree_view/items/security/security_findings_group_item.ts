import * as vscode from 'vscode';
import { groupBy } from 'lodash';
import { ItemModel } from '../item_model';

import { Node } from '../../../gitlab/graphql/shared';
import { GqlSecurityFinding } from '../../../gitlab/graphql/get_security_finding_report';
import { SecurityFindingSeverityGroup } from './security_finding_severity_group_item';
import { Severity } from './severity_to_icon';

export type SecurityFindingGroupType = 'ADDED' | 'FIXED';

export class SecurityFindingsGroupItem extends ItemModel {
  readonly #findings: Node<GqlSecurityFinding>;

  readonly #securityFindingGroupType: SecurityFindingGroupType;

  constructor(
    securityFindingGroupType: SecurityFindingGroupType,
    findings: Node<GqlSecurityFinding>,
  ) {
    super();
    this.#findings = findings;
    this.#securityFindingGroupType = securityFindingGroupType;
  }

  getTreeItem(): vscode.TreeItem {
    const label = this.#securityFindingGroupType === 'ADDED' ? 'New findings' : 'Fixed findings';
    return new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
  }

  async getChildren(): Promise<ItemModel[]> {
    const findingsBySeverity = groupBy(this.#findings.nodes, 'severity');

    return Object.entries(findingsBySeverity)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([severity, findings]) => new SecurityFindingSeverityGroup(findings, severity as Severity),
      );
  }
}
