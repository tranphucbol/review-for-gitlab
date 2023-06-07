import { TreeItem } from 'vscode';
import * as vscode from 'vscode';

export type SecurityResultsState = 'NO_SCANS_FOUND' | 'RUNNING' | 'COMPLETE';

export class SecurityResultsItem extends TreeItem {
  constructor(state: SecurityResultsState) {
    if (state === 'NO_SCANS_FOUND') {
      super('No scans found');
    }
    if (state === 'RUNNING') {
      super('Security scanning');
      this.description = 'In progress';
      this.iconPath = new vscode.ThemeIcon('shield');
    }
    if (state === 'COMPLETE') {
      super('Security scanning');
      this.description = 'Complete';
      this.iconPath = new vscode.ThemeIcon('shield');
    }
  }
}
