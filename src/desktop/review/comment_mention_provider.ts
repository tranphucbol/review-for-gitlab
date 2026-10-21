import * as vscode from 'vscode';
import { COMMENT_URI_SCHEME, getMrContextForCommentUri } from './comment_attachment_provider';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { getMentionCandidates } from '../mentions/mention_candidates';

/** An `@` that starts a word, and the username typed after it so far. */
const MENTION_BEFORE_CURSOR = /(^|[\s([{>])@([\w.-]*)$/;

/** Suggests people after `@` in the comment input of a merge request review. */
export class CommentMentionProvider implements vscode.CompletionItemProvider {
  // eslint-disable-next-line class-methods-use-this
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionList | undefined> {
    const mrContext = getMrContextForCommentUri(document.uri);
    if (!mrContext) return undefined;

    const textBefore = document.lineAt(position.line).text.slice(0, position.character);
    const match = MENTION_BEFORE_CURSOR.exec(textBefore);
    if (!match) return undefined;

    const query = match[2];
    const start = position.character - query.length - 1;
    const range = new vscode.Range(position.line, start, position.line, position.character);

    const { mentions } = await getMentionCandidates(
      getGitLabService(mrContext.projectInRepository),
      mrContext.mr,
      query,
    );
    if (token.isCancellationRequested) return undefined;

    const items = mentions.map((mention, index) => {
      const item = new vscode.CompletionItem(
        { label: `@${mention.username}`, description: mention.name },
        vscode.CompletionItemKind.User,
      );
      item.detail = mention.participant ? 'Participant' : 'Project member';
      item.insertText = `@${mention.username} `;
      item.filterText = `@${mention.username} ${mention.name}`;
      item.sortText = String(index).padStart(3, '0');
      item.range = range;
      return item;
    });
    // the server filters by the query, so every keystroke asks again
    return new vscode.CompletionList(items, true);
  }
}

export const registerCommentMentionProvider = (context: vscode.ExtensionContext) => {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { scheme: COMMENT_URI_SCHEME },
      new CommentMentionProvider(),
      '@',
    ),
  );
};
