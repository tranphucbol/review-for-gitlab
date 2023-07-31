import * as vscode from 'vscode';

import { GitLabChatController } from '../gitlab_chat_controller';
import { GitLabChatRecord } from '../gitlab_chat_record';

export const COMMAND_EXPLAIN_SELECTED_CODE = 'gl.explainSelectedCode';

const getSelectedText = (): string => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.selection || editor.selection.isEmpty) return '';

  const { selection } = editor;

  const selectionRange = new vscode.Range(
    selection.start.line,
    selection.start.character,
    selection.end.line,
    selection.end.character,
  );

  return editor.document.getText(selectionRange);
};

/**
 * Command will explain currently selected code with GitLab Chat
 */
export const explainSelectedCode = async (controller: GitLabChatController) => {
  const selectedText = getSelectedText();

  const record = new GitLabChatRecord({
    role: 'user',
    type: 'explainCode',
    content: `Explain this code\n\n\`\`\`\n${selectedText}\n\`\`\``,
    payload: { selectedText },
  });

  await controller.processNewUserRecord(record);
};
