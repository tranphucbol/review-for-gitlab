import * as vscode from 'vscode';
import { createExtensionContext } from '../../../common/test_utils/entities';
import { createFakePartial } from '../../../common/test_utils/create_fake_partial';
import { VS_COMMANDS } from '../../command_names';
import { getFileContent } from '../../git/get_file_content';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { GitLabService } from '../../gitlab/gitlab_service';
import { gitlabProjectRepository } from '../../gitlab/gitlab_project_repository';
import { GqlDiscussion } from '../../gitlab/graphql/get_discussions';
import { UnsupportedVersionError } from '../../errors/unsupported_version_error';
import { UserFriendlyError } from '../../errors/user_friendly_error';
import { diffFile, mr, mrVersion, projectInRepository } from '../../test_utils/entities';
import { MrDiffPanelController } from './mr_diff_panel_controller';
import { FromWebviewMessage } from './messages';
import { MAX_IMAGE_BYTES } from './mr_diff_panel';

jest.mock('../../../common/utils/webviews/prepare_webview_source', () => ({
  prepareWebviewSource: jest.fn().mockResolvedValue('preparedWebviewSource'),
}));
jest.mock('../../../common/log');
jest.mock('../../git/get_file_content');
jest.mock('../../gitlab/get_gitlab_service');
jest.mock('../../gitlab/gitlab_project_repository');

const encode = (text: string) => Buffer.from(text);

describe('MrDiffPanelController', () => {
  let controller: MrDiffPanelController;
  let gitlabService: GitLabService;
  let sendToHost: (message: FromWebviewMessage) => Promise<void>;
  let panel: vscode.WebviewPanel;

  const target = { mr, mrVersion, file: diffFile, repositoryRoot: '/repo' };

  const allPostedMessages = () =>
    jest.mocked(panel.webview.postMessage).mock.calls.map(([message]) => message);
  // the font and syntax colours go first to every webview; most tests are not about them
  const postedMessages = () =>
    allPostedMessages().filter(m => m.command !== 'tokenTheme' && m.command !== 'editorFont');

  beforeEach(() => {
    jest.mocked(vscode.window.createWebviewPanel).mockImplementation(() => {
      panel = createFakePartial<vscode.WebviewPanel>({
        webview: createFakePartial<vscode.Webview>({
          onDidReceiveMessage: jest.fn().mockImplementation(listener => {
            sendToHost = listener;
          }),
          postMessage: jest.fn().mockResolvedValue(true),
        }),
        onDidDispose: jest.fn(),
        onDidChangeViewState: jest.fn(),
        reveal: jest.fn(),
      });
      return panel;
    });
    jest.mocked(gitlabProjectRepository.getProjectOrFail).mockReturnValue(projectInRepository);
    gitlabService = createFakePartial<GitLabService>({
      getFileContent: jest.fn().mockResolvedValue(new TextEncoder().encode('remote head').buffer),
      getDiscussions: jest.fn().mockResolvedValue([]),
      canUserCommentOnMr: jest.fn().mockResolvedValue(true),
      createDiffNote: jest.fn().mockResolvedValue({}),
      createNote: jest.fn().mockResolvedValue({}),
      uploadFile: jest.fn().mockResolvedValue({ markdown: '![a](/uploads/x/a.png)' }),
    });
    jest.mocked(getGitLabService).mockReturnValue(gitlabService);
    jest
      .mocked(getFileContent)
      .mockImplementation(async (_, path) => (path === diffFile.old_path ? encode('base') : null));
    const subscription = () => jest.fn().mockReturnValue({ dispose: jest.fn() });
    jest.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(
      createFakePartial<vscode.FileSystemWatcher>({
        onDidChange: subscription(),
        onDidCreate: subscription(),
        onDidDelete: subscription(),
        dispose: jest.fn(),
      }),
    );
    jest
      .mocked(vscode.workspace.onDidChangeTextDocument)
      .mockReturnValue({ dispose: jest.fn() } as vscode.Disposable);
    jest
      .mocked(vscode.workspace.onDidCloseTextDocument)
      .mockReturnValue({ dispose: jest.fn() } as vscode.Disposable);
    jest.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('ENOENT'));
    controller = new MrDiffPanelController();
    controller.init(createExtensionContext());
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('opens one panel per file and reveals it the second time', async () => {
    const first = await controller.open(target);
    const second = await controller.open(target);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      expect.anything(),
      'new_file.js (!2000) ↔',
      vscode.ViewColumn.Active,
      expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
    );
    expect(second).toBe(first);
    expect(first.reveal).toHaveBeenCalled();
    expect(first.webview.html).toBe('preparedWebviewSource');
  });

  it('sends the file once the webview is ready, reading locally first', async () => {
    await controller.open(target);
    await sendToHost({ command: 'appReady' });

    expect(postedMessages().filter(m => m.command !== 'localState')).toEqual([
      {
        command: 'init',
        file: expect.objectContaining({
          oldPath: 'old_file.js',
          newPath: 'new_file.js',
          oldText: 'base',
          newText: 'remote head',
          collapsed: false,
          commentableNewLines: [1, 2, 3, 4, 5, 6, 7],
        }),
        aligned: true,
      },
      { command: 'discussions', discussions: [], canComment: true },
    ]);
    expect(gitlabService.getFileContent).toHaveBeenCalledWith(
      'new_file.js',
      mrVersion.head_commit_sha,
      mr.project_id,
    );
  });

  it('sends the syntax colours of the theme before the file, and again on request', async () => {
    await controller.open(target);
    await sendToHost({ command: 'appReady' });

    expect(allPostedMessages()[1]).toEqual({ command: 'tokenTheme', rules: [] });
    expect(allPostedMessages()[2]).toMatchObject({ command: 'init' });

    controller.refreshTokenThemes();
    await new Promise(process.nextTick);

    expect(allPostedMessages().filter(m => m.command === 'tokenTheme')).toHaveLength(2);
  });

  it('sends the editor font settings before the file, and again on request', async () => {
    jest.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      createFakePartial<vscode.WorkspaceConfiguration>({
        get: (key: string) =>
          ({ fontFamily: 'Fira Code', fontSize: 13, fontLigatures: true })[key] as never,
      }),
    );
    await controller.open(target);
    await sendToHost({ command: 'appReady' });

    expect(allPostedMessages()[0]).toEqual({
      command: 'editorFont',
      font: {
        fontFamily: 'Fira Code',
        fontSize: 13,
        fontWeight: 'normal',
        lineHeight: 0,
        letterSpacing: 0,
        fontLigatures: true,
        tabSize: 4,
      },
    });

    controller.refreshEditorFonts();
    await new Promise(process.nextTick);

    expect(allPostedMessages().filter(m => m.command === 'editorFont')).toHaveLength(2);
  });

  it('remembers whether the panes are aligned for the next panel', async () => {
    await controller.open(target);
    await sendToHost({ command: 'setAligned', aligned: false });
    await sendToHost({ command: 'appReady' });

    expect(postedMessages()[0]).toMatchObject({ command: 'init', aligned: false });
  });

  it('marks a file GitLab did not diff as collapsed', async () => {
    await controller.open({ ...target, file: { ...diffFile, diff: '' } });
    await sendToHost({ command: 'appReady' });

    expect(postedMessages()[0]).toMatchObject({
      file: { collapsed: true, commentableNewLines: [] },
    });
  });

  it('reports a file it cannot load', async () => {
    jest.mocked(gitlabService.getFileContent).mockRejectedValue(new Error('404'));
    await controller.open(target);
    await sendToHost({ command: 'appReady' });

    expect(postedMessages()[0]).toEqual({
      command: 'error',
      message: expect.stringContaining('new_file.js'),
    });
  });

  it('opens the native diff on request', async () => {
    await controller.open(target);
    await sendToHost({ command: 'openNative' });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      VS_COMMANDS.DIFF,
      expect.anything(),
      expect.anything(),
      'new_file.js (!2000)',
    );
  });

  describe('discussions', () => {
    const positionedDiscussion = (position: Record<string, unknown>) =>
      ({
        replyId: 'discussion-1',
        resolvable: true,
        resolved: false,
        notes: {
          nodes: [
            {
              id: 'note-1',
              system: false,
              author: { name: 'Ann', username: 'ann', avatarUrl: null },
              createdAt: '2026-01-01T00:00:00Z',
              body: 'body',
              bodyHtml: '<p>body</p>',
              userPermissions: { resolveNote: true, adminNote: false, createNote: true },
              position: {
                positionType: 'text',
                diffRefs: {
                  baseSha: mrVersion.base_commit_sha,
                  headSha: mrVersion.head_commit_sha,
                  startSha: mrVersion.start_commit_sha,
                },
                oldPath: diffFile.old_path,
                newPath: diffFile.new_path,
                oldLine: null,
                newLine: null,
                ...position,
              },
            },
          ],
        },
      }) as unknown as GqlDiscussion;

    it('sends the discussions on this file with the permission to comment', async () => {
      jest
        .mocked(gitlabService.getDiscussions)
        .mockResolvedValue([
          positionedDiscussion({ newLine: 3 }),
          positionedDiscussion({ newLine: 3, newPath: 'other.js' }),
        ]);
      await controller.open(target);
      await sendToHost({ command: 'refresh' });

      expect(postedMessages()).toEqual([
        {
          command: 'discussions',
          canComment: true,
          discussions: [
            expect.objectContaining({ id: 'discussion-1', side: 'new', line: 3, canReply: true }),
          ],
        },
      ]);
    });

    it('marks discussions unsupported by the GitLab version', async () => {
      jest
        .mocked(gitlabService.getDiscussions)
        .mockRejectedValue(new UnsupportedVersionError('MR Discussions', '13.0.0', '13.5.0'));
      await controller.open(target);
      await sendToHost({ command: 'refresh' });

      expect(postedMessages()).toEqual([
        { command: 'discussions', discussions: [], canComment: false, unsupported: true },
      ]);
    });

    it('reports discussions it cannot load', async () => {
      jest.mocked(gitlabService.getDiscussions).mockRejectedValue(new Error('500'));
      await controller.open(target);
      await sendToHost({ command: 'refresh' });

      expect(postedMessages()).toEqual([
        expect.objectContaining({ command: 'discussions', error: expect.any(String) }),
      ]);
    });

    it('creates a thread, refreshes the discussions and then answers', async () => {
      await controller.open(target);
      await sendToHost({ command: 'createThread', requestId: 1, side: 'new', line: 2, body: 'hi' });

      expect(gitlabService.createDiffNote).toHaveBeenCalledWith(
        mr.id,
        'hi',
        expect.objectContaining({
          newLine: 2,
          paths: { oldPath: 'old_file.js', newPath: 'new_file.js' },
        }),
      );
      expect(postedMessages().map(m => m.command)).toEqual(['discussions', 'result']);
      expect(postedMessages()[1]).toEqual({ command: 'result', requestId: 1 });
    });

    it('refuses a new thread on a file GitLab did not diff', async () => {
      await controller.open({ ...target, file: { ...diffFile, diff: '' } });
      await sendToHost({ command: 'createThread', requestId: 1, side: 'new', line: 2, body: 'hi' });

      expect(gitlabService.createDiffNote).not.toHaveBeenCalled();
      expect(postedMessages()).toEqual([
        { command: 'result', requestId: 1, error: expect.stringContaining('too large') },
      ]);
    });

    it('answers a failed write with the user-friendly message', async () => {
      jest
        .mocked(gitlabService.createNote)
        .mockRejectedValue(new UserFriendlyError("Couldn't create\n   the comment.", new Error()));
      await controller.open(target);
      await sendToHost({ command: 'reply', requestId: 2, discussionId: 'd', body: 'hi' });

      expect(gitlabService.createNote).toHaveBeenCalledWith(mr, 'hi', 'd');
      expect(postedMessages()).toEqual([
        { command: 'result', requestId: 2, error: "Couldn't create the comment." },
      ]);
    });
  });

  describe('image upload', () => {
    it('uploads the image to the merge request project and answers with its markdown', async () => {
      await controller.open(target);
      await sendToHost({
        command: 'uploadImage',
        requestId: 3,
        name: 'a.png',
        contentType: 'image/png',
        base64: Buffer.from('png').toString('base64'),
      });

      expect(gitlabService.uploadFile).toHaveBeenCalledWith(mr.project_id, {
        name: 'a.png',
        contentType: 'image/png',
        content: new Uint8Array(Buffer.from('png')),
      });
      expect(postedMessages()).toEqual([
        { command: 'result', requestId: 3, markdown: '![a](/uploads/x/a.png)' },
      ]);
    });

    it('refuses an image larger than 10 MB', async () => {
      await controller.open(target);
      await sendToHost({
        command: 'uploadImage',
        requestId: 4,
        name: 'big.png',
        contentType: 'image/png',
        base64: Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64'),
      });

      expect(gitlabService.uploadFile).not.toHaveBeenCalled();
      expect(postedMessages()).toEqual([
        { command: 'result', requestId: 4, error: expect.stringContaining('10 MB') },
      ]);
    });
  });

  describe('local file arrows', () => {
    const block = { blockId: 0, oldStart: 0, oldCount: 1, newStart: 0, newCount: 1 };
    let localText: string;
    let document: vscode.TextDocument;

    const localStates = () => postedMessages().filter(m => m.command === 'localState');

    beforeEach(() => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(
          createFakePartial<vscode.WorkspaceConfiguration>({ showLocalChangeButtons: true }),
        );
      localText = 'base';
      document = createFakePartial<vscode.TextDocument>({
        uri: vscode.Uri.file('/repo/new_file.js'),
        eol: vscode.EndOfLine.LF,
        getText: () => localText,
        positionAt: (offset: number) => new vscode.Position(0, offset),
      });
      (vscode.workspace.textDocuments as vscode.TextDocument[]).push(document);
      jest.mocked(vscode.workspace.openTextDocument).mockResolvedValue(document);
      jest.mocked(vscode.workspace.applyEdit).mockImplementation(async () => {
        localText = 'remote head';
        return true;
      });
    });

    afterEach(() => {
      (vscode.workspace.textDocuments as vscode.TextDocument[]).splice(0);
    });

    it('offers to apply blocks when the local file is the base', async () => {
      await controller.open(target);
      await sendToHost({ command: 'appReady' });

      expect(localStates()).toEqual([
        { command: 'localState', enabled: true, applicable: 'base', appliedBlockIds: [] },
      ]);
    });

    it('offers nothing unless the user turned the buttons on', async () => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(createFakePartial<vscode.WorkspaceConfiguration>({}));
      await controller.open(target);
      await sendToHost({ command: 'appReady' });

      expect(localStates()).toEqual([
        { command: 'localState', enabled: false, applicable: 'none', appliedBlockIds: [] },
      ]);
    });

    it('refuses to change the local file while the buttons are off', async () => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(createFakePartial<vscode.WorkspaceConfiguration>({}));
      await controller.open(target);
      await sendToHost({ command: 'applyHunk', requestId: 4, direction: 'apply', ...block });

      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
      expect(postedMessages()).toContainEqual({
        command: 'result',
        requestId: 4,
        error: expect.stringContaining('showLocalChangeButtons'),
      });
    });

    it('shows the buttons in open views when the setting changes', async () => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(createFakePartial<vscode.WorkspaceConfiguration>({}));
      await controller.open(target);
      await sendToHost({ command: 'appReady' });
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(
          createFakePartial<vscode.WorkspaceConfiguration>({ showLocalChangeButtons: true }),
        );
      controller.refreshLocalStates();
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(localStates().map(m => m.enabled)).toEqual([false, true]);
    });

    it('offers nothing for a file the merge request deletes', async () => {
      await controller.open({ ...target, file: { ...diffFile, deleted_file: true } });
      await sendToHost({ command: 'appReady' });

      expect(localStates()).toEqual([
        expect.objectContaining({ applicable: 'none', reason: expect.stringContaining('deletes') }),
      ]);
    });

    it('offers nothing for a file the merge request adds', async () => {
      await controller.open({ ...target, file: { ...diffFile, new_file: true } });
      await sendToHost({ command: 'appReady' });

      expect(localStates()).toEqual([
        expect.objectContaining({ applicable: 'none', reason: expect.stringContaining('adds') }),
      ]);
    });

    it('refuses to change the local copy of a file the merge request adds', async () => {
      await controller.open({ ...target, file: { ...diffFile, new_file: true } });
      await sendToHost({ command: 'applyHunk', requestId: 6, direction: 'revert', ...block });

      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
      expect(postedMessages()).toContainEqual({
        command: 'result',
        requestId: 6,
        error: expect.stringContaining('cannot change the local file'),
      });
    });

    it('applies a block as an unsaved edit, then reports it applied before answering', async () => {
      await controller.open(target);
      await sendToHost({ command: 'applyHunk', requestId: 5, direction: 'apply', ...block });

      const [edit] = jest.mocked(vscode.workspace.applyEdit).mock.calls[0];
      expect(edit.replace).toHaveBeenCalledWith(
        document.uri,
        { start: new vscode.Position(0, 0), end: new vscode.Position(0, 4) },
        'remote head',
      );
      expect(postedMessages()).toEqual([
        { command: 'localState', enabled: true, applicable: 'base', appliedBlockIds: [0] },
        { command: 'result', requestId: 5 },
      ]);
    });

    it('changes nothing when the local file is not what the arrow expects', async () => {
      localText = 'local work';
      await controller.open(target);
      await sendToHost({ command: 'applyHunk', requestId: 6, direction: 'apply', ...block });

      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
      expect(postedMessages()).toEqual([
        expect.objectContaining({ command: 'localState', applicable: 'none' }),
        { command: 'result', requestId: 6, error: expect.stringContaining('reopen the view') },
      ]);
    });

    it('answers a definition request from the local file', async () => {
      jest
        .mocked(vscode.commands.executeCommand)
        .mockResolvedValue([
          new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 4)),
        ] as never);
      await controller.open(target);
      await sendToHost({ command: 'definitions', requestId: 7, side: 'old', line: 1, column: 2 });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.executeDefinitionProvider',
        document.uri,
        new vscode.Position(0, 1),
      );
      expect(postedMessages()).toEqual([
        {
          command: 'result',
          requestId: 7,
          locations: [
            { side: 'old', range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 } },
          ],
        },
      ]);
    });

    it('answers a definition request with nothing when the language extensions fail', async () => {
      jest.mocked(vscode.commands.executeCommand).mockRejectedValue(new Error('no provider'));
      await controller.open(target);
      await sendToHost({ command: 'definitions', requestId: 8, side: 'old', line: 1, column: 2 });

      expect(postedMessages()).toEqual([{ command: 'result', requestId: 8 }]);
    });

    it('stops watching the local file when the panel closes', async () => {
      const opened = await controller.open(target);
      const [onDispose] = jest.mocked(opened.onDidDispose).mock.calls[0];
      onDispose();

      const watcher = jest.mocked(vscode.workspace.createFileSystemWatcher).mock.results[0].value;
      expect(watcher.dispose).toHaveBeenCalled();
    });
  });
});
