/*
  The message contract between the side-by-side diff panel and its webview
  (webviews/vue/mr_diff). Every message carries a `command`. A message with a
  `requestId` is answered with exactly one `result` message.
*/

import type { JiraLinkConfig } from '../../jira/jira_keys';
import type { MentionCandidate } from '../../mentions/mention_candidates';
import type { EmojiEntry, NoteReactions, ReactionGroup } from '../../reactions/note_reactions';

export type DiffSide = 'old' | 'new';

/** a 1-based line of one pane */
export interface DiffLocation {
  side: DiffSide;
  line: number;
}

export interface DiffFileModel {
  oldPath: string;
  newPath: string;
  oldText: string;
  newText: string;
  oldExists: boolean;
  newExists: boolean;
  /** GitLab's unified diff for the file; empty when `collapsed` */
  diff: string;
  /** GitLab returned no diff (too large), the webview aligns the lines itself */
  collapsed: boolean;
  /** head lines that GitLab accepts a new diff comment on */
  commentableNewLines: number[];
  /**
   * Set when the panes show two versions of the merge request rather than its base and latest
   * head: the old pane is read-only, and the new one takes comments only at the latest head.
   */
  comparison?: {
    /** such as `v3 → v5` */
    label: string;
    /** the target branch moved between the two versions, so some changes may come from it */
    rebased: boolean;
  };
}

export interface DiffNoteModel {
  id: string;
  authorName: string;
  authorUsername: string;
  avatarUrl: string;
  createdAt: string;
  body: string;
  bodyHtml: string;
  canEdit: boolean;
  canDelete: boolean;
  /** the user may add and remove reactions on the note */
  canReact: boolean;
}

export interface DiffDiscussionModel {
  /** the GraphQL reply ID, used for replies and resolving */
  id: string;
  side: DiffSide;
  line: number;
  resolvable: boolean;
  resolved: boolean;
  canResolve: boolean;
  canReply: boolean;
  notes: DiffNoteModel[];
}

export type LocalApplicability = 'base' | 'head' | 'none';

export interface BlockRange {
  blockId: number;
  /** 0-based index of the first base line */
  oldStart: number;
  oldCount: number;
  /** 0-based index of the first head line */
  newStart: number;
  newCount: number;
}

/** A place in a pane, 1-based like Monaco. */
export interface CodePosition {
  side: DiffSide;
  line: number;
  column: number;
  /** the same line on the other side, when the line is unchanged */
  otherLine?: number;
}

/** 1-based, end column exclusive */
export interface CodeRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * A code navigation target: in the file under review, on the `side` the local file equals,
 * or in another file, by `uri`. `preview` is that file's text, for Monaco's Ctrl+hover and references previews.
 */
export type CodeLocation =
  | { side: DiffSide; range: CodeRange }
  | { uri: string; range: CodeRange; preview?: string };

export interface CodeHover {
  /** markdown */
  contents: string[];
  range?: CodeRange;
}

/** A Monaco theme rule: `foreground` is `rrggbb`, `fontStyle` like TextMate's (`italic bold`). */
export interface TokenRule {
  token: string;
  foreground?: string;
  fontStyle?: string;
}

/**
 * The `editor.*` settings, as VS Code stores them, so the panes draw text like the editors do.
 * Empty `fontFamily` and zero `fontSize` mean the webview keeps its own; zero `lineHeight`
 * means "derived from the font size", as in VS Code.
 */
export interface EditorFont {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  letterSpacing: number;
  fontLigatures: boolean | string;
  tabSize: number;
}

/** What a key or a `gl.sideBySide*` command asks the view to do. */
export type DiffAction =
  | 'nextChange'
  | 'previousChange'
  | 'commentOnLine'
  | 'goToDefinition'
  | 'findReferences'
  | 'goToSource';

/**
 * A key the panes handle themselves, resolved on the host from VS Code's keybindings.
 * `key` is in VS Code's syntax for this platform (`cmd+b`, `ctrl+k ctrl+d`); `when`, if set,
 * holds only `editorLangId` comparisons.
 */
export interface DiffKeybinding {
  key: string;
  action: DiffAction;
  when?: string;
}

export type ToWebviewMessage =
  /**
   * `aligned`: fillers keep both sides row-aligned; the user's last choice. `generation`
   * identifies this load of the file; the webview sends it back with every write whose lines
   * were counted in it.
   */
  | { command: 'init'; file: DiffFileModel; aligned: boolean; generation: number }
  /** the editor font settings, sent before `init` and after they change */
  | { command: 'editorFont'; font: EditorFont }
  /** the syntax colours of the active VS Code theme, sent before `init` and after a theme change */
  | { command: 'tokenTheme'; rules: TokenRule[] }
  /** the Jira link settings, sent before `init` and after they change; `null` when off */
  | { command: 'jiraLinks'; config: JiraLinkConfig | null }
  /** the keys the panes take over, sent before `init` and when a panel is shown again */
  | { command: 'keybindings'; keybindings: DiffKeybinding[] }
  /** a `gl.sideBySide*` command ran with this view active */
  | { command: 'runAction'; action: DiffAction }
  /** scroll to a line, such as the one the Comments panel revealed; sent after `discussions` */
  | ({ command: 'reveal' } & DiffLocation)
  | {
      command: 'discussions';
      discussions: DiffDiscussionModel[];
      canComment: boolean;
      unsupported?: boolean;
      error?: string;
    }
  /**
   * the reactions on the notes of `discussions`, by note ID, sent after them; a note missing
   * from it has none that could be read
   */
  | { command: 'reactions'; reactions: NoteReactions }
  /**
   * Which arrows the gutter shows: `base` (→, copy head lines into the local file),
   * `head` (←, put base lines back) or none, with the reason. With `enabled` false the user
   * has not turned the buttons on, and the view shows nothing about the local file.
   */
  | {
      command: 'localState';
      enabled: boolean;
      applicable: LocalApplicability;
      reason?: string;
      appliedBlockIds: number[];
    }
  | {
      command: 'result';
      requestId: number;
      error?: string;
      markdown?: string;
      /** the answer to `previewMarkdown`: the body as GitLab renders it */
      html?: string;
      locations?: CodeLocation[];
      hover?: CodeHover;
      /** the answer to `searchMentions`, participants first */
      mentions?: MentionCandidate[];
      /** why `mentions` is empty when nobody could be loaded; the box stays usable */
      mentionsError?: string;
      /** the answer to `setReaction`: the note's reactions as GitLab now has them */
      reactions?: ReactionGroup[];
      /** the answer to `loadEmojis`: every emoji a reaction can be chosen from */
      emojis?: EmojiEntry[];
    }
  | { command: 'error'; message: string };

export type FromWebviewMessage =
  | { command: 'appReady' }
  | { command: 'openNative' }
  | { command: 'refresh' }
  | { command: 'setAligned'; aligned: boolean }
  | {
      command: 'createThread';
      requestId: number;
      generation: number;
      side: DiffSide;
      line: number;
      body: string;
    }
  | { command: 'reply'; requestId: number; discussionId: string; body: string }
  | { command: 'editNote'; requestId: number; noteId: string; body: string; originalBody: string }
  | { command: 'deleteNote'; requestId: number; noteId: string }
  | { command: 'setResolved'; requestId: number; discussionId: string; resolved: boolean }
  | { command: 'uploadImage'; requestId: number; name: string; contentType: string; base64: string }
  /** renders a draft in the merge request's project, as GitLab will show the saved comment */
  | { command: 'previewMarkdown'; requestId: number; body: string }
  /** people to suggest for the `@mention` being typed in a comment box */
  | { command: 'searchMentions'; requestId: number; query: string }
  /** adds (`on`) or removes the user's reaction `name` on a note */
  | { command: 'setReaction'; requestId: number; noteId: string; name: string; on: boolean }
  | { command: 'loadEmojis'; requestId: number }
  | ({
      command: 'applyHunk';
      requestId: number;
      generation: number;
      direction: 'apply' | 'revert';
    } & BlockRange)
  /** code navigation, answered by the language extensions for the local file */
  | ({ command: 'definitions'; requestId: number } & CodePosition)
  | ({ command: 'references'; requestId: number } & CodePosition)
  | ({ command: 'hover'; requestId: number } & CodePosition)
  /** opens a `uri` location from a `definitions` or `references` answer in a VS Code editor */
  | { command: 'openLocation'; uri: string; line: number; column: number }
  /** opens the local file on the lines of `range` in the `side` pane, as counted in `generation` */
  | ({ command: 'openSource'; generation: number; side: DiffSide } & CodeRange);
