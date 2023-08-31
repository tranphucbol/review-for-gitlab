import * as vscode from 'vscode';

export interface IStatus {
  text: string;
  tooltip: string;
}

export const createStatusBarItem = ({
  priority,
  id,
  name,
  initialText,
  command,
}: {
  priority: number;
  id: string;
  name: string;
  initialText: string;
  command?: string | vscode.Command;
}) => {
  const statusBarItem = vscode.window.createStatusBarItem(
    id,
    vscode.StatusBarAlignment.Left,
    priority,
  );
  statusBarItem.name = name;
  statusBarItem.text = initialText;
  statusBarItem.show();

  if (command) {
    statusBarItem.command = command;
  }

  return statusBarItem;
};

export function setStatusBar(item: vscode.StatusBarItem, { text, tooltip }: IStatus) {
  /* eslint-disable no-param-reassign */
  item.text = text;
  item.tooltip = tooltip;
  /* eslint-enable no-param-reassign */
}
