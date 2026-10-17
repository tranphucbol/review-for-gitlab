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
import { MAX_FILE_BYTES } from './mr_diff_panel';
import { MAX_IMAGE_BYTES } from '../comment_attachment_provider';

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
  // the font, syntax colours and Jira links go first to every webview; most tests are not about them
  const postedMessages = () =>
    allPostedMessages().filter(
      m => m.command !== 'tokenTheme' && m.command !== 'editorFont' && m.command !== 'jiraLinks',
    );

  beforeEach(() => {
    jest.mocked(vscode.window.createWebviewPanel).mockImplementation(() => {
      panel = createFakePartial<vscode.WebviewPanel>({
        webview: createFakePartial<vscode.Webview>({
          onDidReceiveMessage: jest.fn().mockImplementation(listener => {
            sendToHost = listener;
            return { dispose: jest.fn() };
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
      getMrDiff: jest.fn().mockResolvedValue(mrVersion),
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
    expect(first.iconPath).toEqual({
      light: expect.objectContaining({
        fsPath: expect.stringContaining('light/merge_requests.svg'),
      }),
      dark: expect.objectContaining({ fsPath: expect.stringContaining('dark/merge_requests.svg') }),
    });
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
        generation: 1,
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
    expect(allPostedMessages()[3]).toMatchObject({ command: 'init' });

    controller.refreshTokenThemes();
    await new Promise(process.nextTick);

    expect(allPostedMessages().filter(m => m.command === 'tokenTheme')).toHaveLength(2);
  });

  it('sends the Jira link settings after the theme and before the file, and again on request', async () => {
    await controller.open(target);
    await sendToHost({ command: 'appReady' });

    expect(
      allPostedMessages()
        .slice(0, 4)
        .map(m => m.command),
    ).toEqual(['editorFont', 'tokenTheme', 'jiraLinks', 'init']);
    expect(allPostedMessages()[2]).toEqual({ command: 'jiraLinks', config: null });

    jest
      .mocked(vscode.workspace.getConfiguration)
      .mockReturnValue(
        createFakePartial<vscode.WorkspaceConfiguration>({ url: 'https://jira.example/' }),
      );
    controller.refreshJiraLinks();
    await new Promise(process.nextTick);

    expect(allPostedMessages().filter(m => m.command === 'jiraLinks')[1]).toEqual({
      command: 'jiraLinks',
      config: {
        issueUrlPrefix: 'https://jira.example/browse/',
        pattern: expect.any(String),
      },
    });
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

  describe('a newer version of the merge request', () => {
    const newerVersion = {
      ...mrVersion,
      id: mrVersion.id + 1,
      head_commit_sha: 'newer-head',
      diffs: [{ ...diffFile, diff: '@@ -1,1 +1,1 @@\n-a\n+b\n' }],
    };
    const inits = () => postedMessages().filter(m => m.command === 'init');
    const commandsAfterLastInit = () => {
      const commands = postedMessages().map(m => m.command);
      return commands.slice(commands.lastIndexOf('init') + 1).sort();
    };

    beforeEach(() => {
      jest
        .mocked(gitlabService.getFileContent)
        .mockImplementation(
          async (_, ref) =>
            new TextEncoder().encode(ref === 'newer-head' ? 'newer head' : 'remote head').buffer,
        );
    });

    it('shows the newer version when the open file is opened again', async () => {
      const first = await controller.open(target);
      await sendToHost({ command: 'appReady' });
      const second = await controller.open({
        ...target,
        mrVersion: newerVersion,
        file: newerVersion.diffs[0],
      });

      expect(second).toBe(first);
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(inits().map(m => m.file.newText)).toEqual(['remote head', 'newer head']);
      expect(commandsAfterLastInit()).toEqual(['discussions', 'localState']);
    });

    it('sends nothing new when the file is opened again at the same version', async () => {
      await controller.open(target);
      await sendToHost({ command: 'appReady' });
      jest.mocked(panel.webview.postMessage).mockClear();
      await controller.open(target);

      expect(postedMessages()).toEqual([]);
    });

    it('loads the newer version on refresh', async () => {
      jest.mocked(gitlabService.getMrDiff).mockResolvedValue(newerVersion);
      await controller.open(target);
      await sendToHost({ command: 'refresh' });

      expect(inits()).toEqual([
        expect.objectContaining({ file: expect.objectContaining({ newText: 'newer head' }) }),
      ]);
      expect(gitlabService.getFileContent).toHaveBeenCalledWith(
        'new_file.js',
        'newer-head',
        mr.project_id,
      );
      expect(commandsAfterLastInit()).toEqual(['discussions', 'localState']);
    });

    it('posts only the latest version when an older one finishes loading last', async () => {
      let finishOlder: (content: ArrayBuffer) => void = () => {};
      const newest = { ...newerVersion, id: newerVersion.id + 1, head_commit_sha: 'newest-head' };
      jest.mocked(gitlabService.getFileContent).mockImplementation(async (_, ref) => {
        if (ref === 'newer-head') {
          return new Promise(resolve => {
            finishOlder = resolve;
          });
        }
        return new TextEncoder().encode(ref === 'newest-head' ? 'newest head' : 'remote head')
          .buffer;
      });
      await controller.open(target);
      await sendToHost({ command: 'appReady' });

      const older = controller.open({
        ...target,
        mrVersion: newerVersion,
        file: newerVersion.diffs[0],
      });
      await controller.open({ ...target, mrVersion: newest, file: newest.diffs[0] });
      finishOlder(new TextEncoder().encode('newer head').buffer);
      await older;

      expect(inits().map(m => [m.file.newText, m.generation])).toEqual([
        ['remote head', 1],
        ['newest head', 3],
      ]);
    });

    it('refuses a comment counted against a version the view no longer shows', async () => {
      await controller.open(target);
      await sendToHost({ command: 'appReady' });
      await controller.open({ ...target, mrVersion: newerVersion, file: newerVersion.diffs[0] });
      await sendToHost({
        command: 'createThread',
        requestId: 9,
        generation: 1,
        side: 'new',
        line: 2,
        body: 'hi',
      });

      expect(gitlabService.createDiffNote).not.toHaveBeenCalled();
      expect(postedMessages()).toContainEqual({
        command: 'result',
        requestId: 9,
        error: expect.stringContaining('newer version'),
      });
    });

    it('keeps the shown version on refresh when the newer one no longer changes the file', async () => {
      jest.mocked(gitlabService.getMrDiff).mockResolvedValue({ ...newerVersion, diffs: [] });
      await controller.open(target);
      await sendToHost({ command: 'refresh' });

      expect(postedMessages().map(m => m.command)).toEqual(['discussions']);
    });

    it('still refreshes the discussions when the newer version cannot be fetched', async () => {
      jest.mocked(gitlabService.getMrDiff).mockRejectedValue(new Error('500'));
      await controller.open(target);
      await sendToHost({ command: 'refresh' });

      expect(postedMessages().map(m => m.command)).toEqual(['discussions']);
    });
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

  describe('a file the view cannot show', () => {
    const expectNativeDiffError = (reason: string) => {
      expect(postedMessages().filter(m => m.command !== 'discussions')).toEqual([
        {
          command: 'error',
          message: `The side-by-side diff can't show new_file.js: ${reason}. Open the native diff instead.`,
        },
      ]);
    };

    it('refuses a file with a NUL byte', async () => {
      jest
        .mocked(gitlabService.getFileContent)
        .mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1]).buffer);
      await controller.open(target);
      await sendToHost({ command: 'appReady' });

      expectNativeDiffError('it is a binary file');
    });

    it('refuses a file over 2 MB', async () => {
      jest
        .mocked(gitlabService.getFileContent)
        .mockResolvedValue(new Uint8Array(MAX_FILE_BYTES + 1).fill(0x61).buffer);
      await controller.open(target);
      await sendToHost({ command: 'appReady' });

      expectNativeDiffError('it is larger than 2 MB');
    });

    it('refuses a file GitLab marks as binary without reading it', async () => {
      await controller.open({
        ...target,
        file: { ...diffFile, diff: 'Binary files a/old_file.js and b/new_file.js differ\n' },
      });
      await sendToHost({ command: 'appReady' });

      expectNativeDiffError('it is a binary file');
      expect(gitlabService.getFileContent).not.toHaveBeenCalled();
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

    it('shows the token error when GitLab refuses the token', async () => {
      const unauthorized = Object.assign(new Error('401 Unauthorized'), { status: 401 });
      jest.mocked(gitlabService.getDiscussions).mockRejectedValue(unauthorized);
      await controller.open(target);
      await sendToHost({ command: 'refresh' });

      expect(postedMessages()).toEqual([
        expect.objectContaining({ command: 'discussions', error: expect.any(String) }),
      ]);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('401 Unauthorized', 'Show Logs');
    });

    it('finds a refused token inside a wrapping error', async () => {
      const unauthorized = Object.assign(new Error('Response not successful'), {
        response: { status: 401 },
      });
      jest
        .mocked(gitlabService.uploadFile)
        .mockRejectedValue(new UserFriendlyError("Couldn't upload.", unauthorized));
      await controller.open(target);
      await sendToHost({
        command: 'uploadImage',
        requestId: 7,
        name: 'a.png',
        contentType: 'image/png',
        base64: Buffer.from('png').toString('base64'),
      });

      expect(postedMessages()).toEqual([
        { command: 'result', requestId: 7, error: expect.any(String) },
      ]);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
    });

    it('keeps a server error in the card without a notification', async () => {
      const serverError = Object.assign(new Error('500 Internal Server Error'), { status: 500 });
      jest.mocked(gitlabService.getDiscussions).mockRejectedValue(serverError);
      await controller.open(target);
      await sendToHost({ command: 'refresh' });

      expect(postedMessages()).toEqual([
        expect.objectContaining({ command: 'discussions', error: expect.any(String) }),
      ]);
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('creates a thread, refreshes the discussions and then answers', async () => {
      await controller.open(target);
      await sendToHost({
        command: 'createThread',
        requestId: 1,
        generation: 1,
        side: 'new',
        line: 2,
        body: 'hi',
      });

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
      await sendToHost({
        command: 'createThread',
        requestId: 1,
        generation: 1,
        side: 'new',
        line: 2,
        body: 'hi',
      });

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

    it('refuses a content type that is not an image', async () => {
      await controller.open(target);
      await sendToHost({
        command: 'uploadImage',
        requestId: 8,
        name: 'a.html',
        contentType: 'text/html',
        base64: Buffer.from('<p>').toString('base64'),
      });

      expect(gitlabService.uploadFile).not.toHaveBeenCalled();
      expect(postedMessages()).toEqual([
        { command: 'result', requestId: 8, error: 'a.html is not an image.' },
      ]);
    });

    it("names the merge request's project when the upload fails", async () => {
      jest.mocked(gitlabService.uploadFile).mockRejectedValue(new Error('500'));
      await controller.open(target);
      await sendToHost({
        command: 'uploadImage',
        requestId: 9,
        name: 'a.png',
        contentType: 'image/png',
        base64: Buffer.from('png').toString('base64'),
      });

      expect(postedMessages()).toEqual([
        {
          command: 'result',
          requestId: 9,
          error: "Couldn't upload the image to the gitlab-org/gitlab project.",
        },
      ]);
      // as in the native comment box, the failure is a notification too
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Couldn't upload the image to the gitlab-org/gitlab project.",
        'Show Logs',
      );
    });
  });

  describe('markdown preview', () => {
    it('renders the draft in the merge request project with absolute links', async () => {
      gitlabService.renderMarkdown = jest
        .fn()
        .mockResolvedValue('<p><a href="/gitlab-org/gitlab/uploads/x/a.png">a</a></p>');
      await controller.open(target);
      await sendToHost({ command: 'previewMarkdown', requestId: 5, body: '**hi**' });

      expect(gitlabService.renderMarkdown).toHaveBeenCalledWith('**hi**', {
        namespaceWithPath: 'gitlab-org/gitlab',
      });
      expect(postedMessages()).toEqual([
        {
          command: 'result',
          requestId: 5,
          html: `<p><a href="${projectInRepository.account.instanceUrl}/gitlab-org/gitlab/uploads/x/a.png">a</a></p>`,
        },
      ]);
    });

    it('answers a failed rendering with an error', async () => {
      gitlabService.renderMarkdown = jest.fn().mockRejectedValue(new Error('500'));
      await controller.open(target);
      await sendToHost({ command: 'previewMarkdown', requestId: 6, body: 'hi' });

      expect(postedMessages()).toEqual([
        { command: 'result', requestId: 6, error: "GitLab couldn't render the preview." },
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
      await sendToHost({
        command: 'applyHunk',
        requestId: 4,
        generation: 1,
        direction: 'apply',
        ...block,
      });

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
      await sendToHost({
        command: 'applyHunk',
        requestId: 6,
        generation: 1,
        direction: 'revert',
        ...block,
      });

      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
      expect(postedMessages()).toContainEqual({
        command: 'result',
        requestId: 6,
        error: expect.stringContaining('cannot change the local file'),
      });
    });

    it('applies a block as an unsaved edit, then reports it applied before answering', async () => {
      await controller.open(target);
      await sendToHost({
        command: 'applyHunk',
        requestId: 5,
        generation: 1,
        direction: 'apply',
        ...block,
      });

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
      expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
        'Copied the change into new_file.js.',
        expect.any(Number),
      );
    });

    it('refuses a block counted against a version the view no longer shows', async () => {
      await controller.open(target);
      await sendToHost({
        command: 'applyHunk',
        requestId: 6,
        generation: 0,
        direction: 'apply',
        ...block,
      });

      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
      expect(postedMessages()).toContainEqual({
        command: 'result',
        requestId: 6,
        error: expect.stringContaining('newer version'),
      });
    });

    it('changes nothing when the local file is not what the arrow expects', async () => {
      localText = 'local work';
      await controller.open(target);
      await sendToHost({
        command: 'applyHunk',
        requestId: 6,
        generation: 1,
        direction: 'apply',
        ...block,
      });

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

  describe('closing the panel while the file loads', () => {
    let finishLoad: (content: ArrayBuffer) => void;
    let failLoad: (e: Error) => void;

    beforeEach(() => {
      jest.mocked(gitlabService.getFileContent).mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            finishLoad = resolve;
            failLoad = reject;
          }),
      );
    });

    const openAndClose = async () => {
      const opened = await controller.open(target);
      const ready = sendToHost({ command: 'appReady' });
      jest.mocked(opened.onDidDispose).mock.calls[0][0]();
      return { ready };
    };

    it('posts nothing once the file arrives', async () => {
      const { ready } = await openAndClose();
      jest.mocked(panel.webview.postMessage).mockClear();
      finishLoad(new TextEncoder().encode('remote head').buffer);
      await ready;

      expect(allPostedMessages()).toEqual([]);
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('posts nothing and shows nothing when the file fails to load', async () => {
      const { ready } = await openAndClose();
      jest.mocked(panel.webview.postMessage).mockClear();
      failLoad(new Error('404'));
      await ready;

      expect(allPostedMessages()).toEqual([]);
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('does not set the source of a webview closed while it was read', async () => {
      jest.mocked(vscode.window.createWebviewPanel).mockImplementationOnce(() => {
        panel = createFakePartial<vscode.WebviewPanel>({
          webview: createFakePartial<vscode.Webview>({
            onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            postMessage: jest.fn().mockResolvedValue(true),
          }),
          // VS Code reports the close before the source is read
          onDidDispose: jest.fn().mockImplementation(listener => listener()),
          onDidChangeViewState: jest.fn(),
        });
        return panel;
      });
      const opened = await controller.open(target);

      expect(opened.webview.html).toBeUndefined();
    });
  });

  describe('for the merge request actions', () => {
    const otherMr = { ...mr, id: mr.id + 1, iid: mr.iid + 1 };
    const flush = () => new Promise(process.nextTick);

    it('reports what the active view shows', async () => {
      const opened = await controller.open(target);

      expect(controller.activeTarget()).toBeUndefined();

      Object.assign(opened, { active: true });

      expect(controller.activeTarget()).toEqual(target);
    });

    it('refreshes only the views of the changed merge request', async () => {
      await controller.open(target);
      await controller.open({ ...target, mr: otherMr });
      await sendToHost({ command: 'appReady' });
      jest.mocked(gitlabService.getDiscussions).mockClear();
      jest.mocked(gitlabService.getMrDiff).mockClear();

      controller.refreshPanelsFor(mr);
      await flush();
      await flush();

      expect(gitlabService.getMrDiff).toHaveBeenCalledTimes(1);
      expect(gitlabService.getMrDiff).toHaveBeenCalledWith(mr);
    });
  });
});
