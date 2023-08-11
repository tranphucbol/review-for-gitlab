import * as vscode from 'vscode';
import { severityToIcon, Severity } from './severity_to_icon';
import { USER_COMMANDS } from '../../../command_names';

import { GqlSecurityFinding } from '../../../gitlab/security_findings/api/get_security_finding_report';

export class SecurityFindingItem extends vscode.TreeItem {
  constructor(finding: GqlSecurityFinding, severity: Severity) {
    super(finding.title);
    this.iconPath = severityToIcon(severity);
    this.command = {
      command: USER_COMMANDS.VIEW_SECURITY_FINDING,
      title: '',
      arguments: [finding],
    };
  }
}
