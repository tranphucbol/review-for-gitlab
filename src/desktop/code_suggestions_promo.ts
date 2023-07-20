import * as vscode from 'vscode';
import { DISMISSED_CODE_SUGGESTIONS_PROMO } from './constants';
import { accountService } from './accounts/account_service';
import { GITLAB_COM_URL } from '../common/constants';

const DOCS_LINK = 'https://docs.gitlab.com/ee/user/project/repository/code_suggestions.html';

function isImmediatelyEligibleForPromo() {
  return accountService.getAllAccounts().some(account => account.instanceUrl === GITLAB_COM_URL);
}

async function showPromo() {
  const LEARN_MORE_ACTION = 'Learn more';

  const selection = await vscode.window.showInformationMessage(
    'Get started with Code Suggestions. Code faster and more efficiently with AI-powered code suggestions in VS Code. 13 languages are supported, including JavaScript, Python, Go, Java, Kotlin and Terraform. Enable code suggestions in your user profile preference or see the documentation to learn more.',
    LEARN_MORE_ACTION,
    'Dismiss',
  );

  if (selection === LEARN_MORE_ACTION) {
    await vscode.env.openExternal(vscode.Uri.parse(DOCS_LINK));
  }

  return selection;
}

function markBannerAsDismissed(context: vscode.ExtensionContext) {
  return context.globalState.update(DISMISSED_CODE_SUGGESTIONS_PROMO, true);
}
export const setupCodeSuggestionsPromo = (context: vscode.ExtensionContext) => {
  if (context.globalState.get(DISMISSED_CODE_SUGGESTIONS_PROMO)) return;

  if (isImmediatelyEligibleForPromo()) {
    const changeListener = vscode.workspace.onDidChangeTextDocument(async () => {
      await showPromo();
      await markBannerAsDismissed(context);
      changeListener.dispose();
    });
  } else {
    const accountChangeListener = accountService.onDidChange(async () => {
      if (isImmediatelyEligibleForPromo()) {
        await showPromo();
        await markBannerAsDismissed(context);
        accountChangeListener.dispose();
      }
    });
  }
};
