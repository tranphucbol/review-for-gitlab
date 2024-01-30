import vscode from 'vscode';

export const authenticate = async () => {
  const session = await vscode.authentication.getSession('gitlab', ['api'], {
    createIfNone: true,
  });
  await vscode.window.showInformationMessage(`Account ${session.account.label} has been added.`);
};
