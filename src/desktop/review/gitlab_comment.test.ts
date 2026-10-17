import vscode from 'vscode';
import { GitLabComment } from './gitlab_comment';
import { GitLabCommentThread } from './gitlab_comment_thread';
import { noteOnDiff } from '../../../test/integration/fixtures/graphql/discussions.js';
import { GqlTextDiffNote } from '../gitlab/graphql/shared';

describe('GitLabComment', () => {
  let comment: GitLabComment;

  const createGitLabComment = (note: GqlTextDiffNote) => {
    comment = GitLabComment.fromGqlNote(note, {} as GitLabCommentThread);
  };

  beforeEach(() => {
    createGitLabComment(noteOnDiff as GqlTextDiffNote);
  });
  describe('context', () => {
    it('sets context to canAdmin if the user can edit the comment', () => {
      expect(comment.contextValue).toMatch('canAdmin');
    });

    it('leaves the context undefined if the user cannot edit the comment', () => {
      createGitLabComment({
        ...(noteOnDiff as GqlTextDiffNote),
        userPermissions: {
          ...noteOnDiff.userPermissions,
          adminNote: false, // user can't edit
        },
      });
      expect(comment.contextValue).not.toMatch('canAdmin');
    });
  });

  describe('uploaded attachments', () => {
    const relativeImage = '![image](/uploads/1234hash/image.png)';
    const absoluteImage =
      '![image](https://gitlab.com/viktomas/test-project/uploads/1234hash/image.png)';

    it('renders relative upload links as absolute URLs', () => {
      createGitLabComment({ ...(noteOnDiff as GqlTextDiffNote), body: relativeImage });

      expect(comment.getBodyAsText()).toBe(absoluteImage);
    });

    it('renders upload links of a comment that the user just submitted', () => {
      createGitLabComment({ ...(noteOnDiff as GqlTextDiffNote), body: 'old body' });
      comment = comment.setOriginalBody();
      comment.body = relativeImage;

      expect(comment.markBodyAsSubmitted().getBodyAsText()).toBe(absoluteImage);
    });

    it('keeps already absolute upload links unchanged', () => {
      createGitLabComment({ ...(noteOnDiff as GqlTextDiffNote), body: absoluteImage });

      expect(comment.getBodyAsText()).toBe(absoluteImage);
    });

    it('keeps the body unchanged when the project URL cannot be determined', () => {
      createGitLabComment({
        ...(noteOnDiff as GqlTextDiffNote),
        body: relativeImage,
        url: 'https://gitlab.com/',
      });

      expect(comment.getBodyAsText()).toBe(relativeImage);
    });

    it('keeps the original body relative when the user edits the comment', () => {
      createGitLabComment({ ...(noteOnDiff as GqlTextDiffNote), body: relativeImage });

      expect(comment.setOriginalBody().body).toBe(relativeImage);
    });
  });

  describe('Jira keys', () => {
    const body = 'Fixes PC-12, not `PC-13`';
    const linked = 'Fixes [PC-12](https://jira.example/browse/PC-12), not `PC-13`';

    const setJiraUrl = (url: string) =>
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue({ url } as unknown as vscode.WorkspaceConfiguration);

    afterEach(() => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue({} as vscode.WorkspaceConfiguration);
    });

    it('links Jira keys when gitlab.jira.url is set', () => {
      setJiraUrl('https://jira.example/');
      createGitLabComment({ ...(noteOnDiff as GqlTextDiffNote), body });

      expect(comment.getBodyAsText()).toBe(linked);
    });

    it('leaves the body alone when gitlab.jira.url is empty', () => {
      setJiraUrl('');
      createGitLabComment({ ...(noteOnDiff as GqlTextDiffNote), body });

      expect(comment.getBodyAsText()).toBe(body);
    });

    it('edits and submits the raw body, without the generated links', () => {
      setJiraUrl('https://jira.example/');
      createGitLabComment({ ...(noteOnDiff as GqlTextDiffNote), body });

      const editing = comment.setOriginalBody();
      expect(editing.body).toBe(body);

      const submitted = editing.markBodyAsSubmitted();
      expect(submitted.gqlNote.body).toBe(body);
      expect(submitted.getBodyAsText()).toBe(linked);
    });
  });

  describe('suggestion in the comment', () => {
    const suggestion = `
\`\`\`suggestion:-1+0
function containingFunctionABC(): void{
    function subFunctionDEF(): void{
\`\`\`
`;

    const renderedSuggestion = `
---

Suggestion:

\`\`\`diff
+ function containingFunctionABC(): void{
+     function subFunctionDEF(): void{
\`\`\`

*[open suggestion on the web](https://gitlab.com/viktomas/test-project/-/merge_requests/7#note_754841236)*

---


`;

    const multipleSuggestions = `Adding a line1

\`\`\`suggestion:-1+0
function containingFunctionABC(): void{
    function subFunctionDEF(): void{
\`\`\`
\`\`\`suggestion:-0+0
    function subFunctionAloha(): void{
\`\`\`

And here`;

    const renderedMultipleSuggestions = `Adding a line1

---

Suggestion:

\`\`\`diff
+ function containingFunctionABC(): void{
+     function subFunctionDEF(): void{
\`\`\`

*[open suggestion on the web](https://gitlab.com/viktomas/test-project/-/merge_requests/7#note_754841236)*

---


---

Suggestion:

\`\`\`diff
+     function subFunctionAloha(): void{
\`\`\`

*[open suggestion on the web](https://gitlab.com/viktomas/test-project/-/merge_requests/7#note_754841236)*

---



And here`;

    it('renders suggestion into markdown', () => {
      createGitLabComment({
        ...(noteOnDiff as GqlTextDiffNote),
        body: suggestion,
      });
      expect(comment.body).toEqual(new vscode.MarkdownString(renderedSuggestion));
    });

    it('renders multiple suggestions into markdown', () => {
      createGitLabComment({
        ...(noteOnDiff as GqlTextDiffNote),
        body: multipleSuggestions,
      });
      expect(comment.getBodyAsText()).toEqual(renderedMultipleSuggestions);
    });

    it('editing comment sets the comment body into original markdown', () => {
      createGitLabComment({
        ...(noteOnDiff as GqlTextDiffNote),
        body: suggestion,
      });
      expect(comment.setOriginalBody().body).toEqual(suggestion);
    });

    it('submitting edit will again render the suggestion', () => {
      createGitLabComment({
        ...(noteOnDiff as GqlTextDiffNote),
        body: suggestion,
      });
      comment = comment.setOriginalBody();
      comment.body = `${comment.body}\nabc`;
      expect(comment.markBodyAsSubmitted().getBodyAsText()).toEqual(`${renderedSuggestion}\nabc`);
    });
  });
});
