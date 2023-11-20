import * as vscode from 'vscode';

export const createFakeWorkspaceConfiguration = (
  config: Record<string, unknown>,
): vscode.WorkspaceConfiguration => config as unknown as vscode.WorkspaceConfiguration;

export const createConfigurationChangeTrigger = () => {
  let triggerSettingsRefresh: (() => void) | undefined;

  jest.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation(listener => {
    triggerSettingsRefresh = () => listener({ affectsConfiguration: () => true });
    return { dispose: () => {} };
  });
  return () => {
    if (!triggerSettingsRefresh) {
      throw new Error('no setting change listeners were registered');
    }
    triggerSettingsRefresh();
  };
};
