import * as vscode from 'vscode';
import { CommentMentionProvider } from './comment_mention_provider';
import { commentControllerProvider } from './comment_controller_provider';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { getMentionCandidates } from '../mentions/mention_candidates';
import { mr, projectInRepository } from '../test_utils/entities';
import { asMock } from '../test_utils/as_mock';
import { Uri } from '../test_utils/uri';

jest.mock('./comment_controller_provider');
jest.mock('../gitlab/get_gitlab_service');
jest.mock('../mentions/mention_candidates');

const commentUri = new Uri({
  scheme: 'comment',
  authority: 'gitlab-mr-gitlab-org/gitlab!1',
  path: '/tranphucbol.review-for-gitlab/commentinput-1.md',
  query: '',
  fragment: '',
});

const createDocument = (line: string, uri: vscode.Uri = commentUri) =>
  ({ uri, lineAt: () => ({ text: line }) }) as unknown as vscode.TextDocument;

const endOf = (line: string) => ({ line: 0, character: line.length }) as vscode.Position;

const token = { isCancellationRequested: false } as vscode.CancellationToken;

describe('CommentMentionProvider', () => {
  const service = {};
  let provider: CommentMentionProvider;

  beforeEach(() => {
    asMock(commentControllerProvider.getMrContext).mockReturnValue({ mr, projectInRepository });
    asMock(getGitLabService).mockReturnValue(service);
    asMock(getMentionCandidates).mockResolvedValue({
      mentions: [
        { username: 'tomas', name: 'Tomas Vik', participant: true },
        { username: 'ann', name: 'Ann Smith', participant: false },
      ],
    });
    provider = new CommentMentionProvider();
  });

  const complete = (line: string, document = createDocument(line)) =>
    provider.provideCompletionItems(document, endOf(line), token);

  it('suggests participants and members for the query after @', async () => {
    const list = await complete('thanks @to');

    expect(getMentionCandidates).toHaveBeenCalledWith(service, mr, 'to');
    expect(list?.isIncomplete).toBe(true);
    expect(list?.items.map(item => item.insertText)).toEqual(['@tomas ', '@ann ']);
    expect(list?.items[0]).toMatchObject({
      label: { label: '@tomas', description: 'Tomas Vik' },
      kind: vscode.CompletionItemKind.User,
      detail: 'Participant',
      filterText: '@tomas Tomas Vik',
      sortText: '000',
      range: { start: { line: 0, character: 7 }, end: { line: 0, character: 10 } },
    });
    expect(list?.items[1].detail).toBe('Project member');
  });

  it.each(['@', '(@', 'a\t@jo.hn-'])('starts a mention at %p', async line => {
    expect(await complete(line)).toBeDefined();
  });

  it.each(['mail@example', 'no mention', '@two words'])('ignores %p', async line => {
    expect(await complete(line)).toBeUndefined();
    expect(getMentionCandidates).not.toHaveBeenCalled();
  });

  it('ignores documents that are not a merge request comment', async () => {
    asMock(commentControllerProvider.getMrContext).mockReturnValue(undefined);

    expect(await complete('@to')).toBeUndefined();
  });

  it('returns nothing once cancelled', async () => {
    const cancelled = { isCancellationRequested: true } as vscode.CancellationToken;

    expect(
      await provider.provideCompletionItems(createDocument('@to'), endOf('@to'), cancelled),
    ).toBeUndefined();
  });
});
