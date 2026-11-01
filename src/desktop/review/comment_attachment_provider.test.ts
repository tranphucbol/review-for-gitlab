import * as vscode from 'vscode';
import { CommentAttachmentProvider, MAX_IMAGE_BYTES } from './comment_attachment_provider';
import { commentControllerProvider } from './comment_controller_provider';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { mr, projectInRepository } from '../test_utils/entities';
import { asMock } from '../test_utils/as_mock';
import { Uri } from '../test_utils/uri';
import { DocumentPasteApi, PasteEditKind } from './document_paste_api';

jest.mock('./comment_controller_provider');
jest.mock('../gitlab/get_gitlab_service');

const commentUri = (authority = 'gitlab-mr-gitlab-org/gitlab!1') =>
  new Uri({
    scheme: 'comment',
    authority,
    path: '/tranphucbol.review-for-gitlab/commentinput-1.md',
    query: '',
    fragment: '',
  });

const createDocument = (uri: vscode.Uri) => ({ uri }) as vscode.TextDocument;

interface FakeItem {
  file?: { name: string; content: Uint8Array };
  text?: string;
}

const createDataTransfer = (items: Record<string, FakeItem>): vscode.DataTransfer => {
  const toItem = (item: FakeItem) => ({
    asFile: () =>
      item.file && {
        name: item.file.name,
        data: async () => item.file?.content,
      },
    asString: async () => item.text,
  });
  return {
    get: (mimeType: string) => items[mimeType] && toItem(items[mimeType]),
    forEach: (callback: (item: unknown, mimeType: string) => void) =>
      Object.entries(items).forEach(([mimeType, item]) => callback(toItem(item), mimeType)),
  } as unknown as vscode.DataTransfer;
};

const token = { isCancellationRequested: false } as vscode.CancellationToken;
const position = {} as vscode.Position;

describe('CommentAttachmentProvider', () => {
  let uploadFile: jest.Mock;
  let provider: CommentAttachmentProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    uploadFile = jest.fn().mockImplementation(async (_projectId, file) => ({
      alt: file.name,
      url: `/uploads/hash/${file.name}`,
      markdown: `![${file.name}](/uploads/hash/${file.name})`,
    }));
    asMock(getGitLabService).mockReturnValue({ uploadFile });
    asMock(commentControllerProvider.getMrContext).mockReturnValue({ mr, projectInRepository });
    provider = new CommentAttachmentProvider();
  });

  describe('dropping and pasting images', () => {
    it('uploads the image to the MR project and inserts the markdown', async () => {
      const dataTransfer = createDataTransfer({
        'image/png': { file: { name: 'image.png', content: new Uint8Array([1, 2, 3]) } },
      });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(getGitLabService).toHaveBeenCalledWith(projectInRepository);
      expect(uploadFile).toHaveBeenCalledWith(mr.project_id, {
        name: 'image.png',
        contentType: 'image/png',
        content: new Uint8Array([1, 2, 3]),
      });
      expect(edit?.insertText).toBe('![image.png](/uploads/hash/image.png)');
    });

    it('uses the comment controller id from the document URI', async () => {
      const dataTransfer = createDataTransfer({
        'image/png': { file: { name: 'image.png', content: new Uint8Array([1]) } },
      });

      await provider.provideDocumentDropEdits(
        createDocument(commentUri('gitlab-mr-gitlab-org/gitlab!1')),
        position,
        dataTransfer,
        token,
      );

      expect(commentControllerProvider.getMrContext).toHaveBeenCalledWith(
        'gitlab-mr-gitlab-org/gitlab!1',
      );
    });

    it('decodes the comment controller id when VS Code keeps it URL encoded', async () => {
      asMock(commentControllerProvider.getMrContext).mockImplementation(id =>
        id === 'gitlab-mr-group/project!1' ? { mr, projectInRepository } : undefined,
      );
      const dataTransfer = createDataTransfer({
        'image/png': { file: { name: 'image.png', content: new Uint8Array([1]) } },
      });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(commentUri('gitlab-mr-group%2Fproject%211')),
        position,
        dataTransfer,
        token,
      );

      expect(edit?.insertText).toBe('![image.png](/uploads/hash/image.png)');
    });

    it('names the file when the data transfer file has no name', async () => {
      const dataTransfer = createDataTransfer({
        'image/jpeg': { file: { name: '', content: new Uint8Array([1]) } },
      });

      await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(uploadFile).toHaveBeenCalledWith(
        mr.project_id,
        expect.objectContaining({ name: 'image.jpg' }),
      );
    });

    it('uploads images referenced by the text/uri-list mime type', async () => {
      asMock(vscode.workspace.fs.readFile).mockResolvedValue(new Uint8Array([7]));
      const dataTransfer = createDataTransfer({
        'text/uri-list': { text: 'file:///tmp/screenshot.PNG\r\nfile:///tmp/notes.txt' },
      });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(uploadFile).toHaveBeenCalledTimes(1);
      expect(uploadFile).toHaveBeenCalledWith(mr.project_id, {
        name: 'screenshot.PNG',
        contentType: 'image/png',
        content: new Uint8Array([7]),
      });
      expect(edit?.insertText).toBe('![screenshot.PNG](/uploads/hash/screenshot.PNG)');
    });

    it("doesn't upload the URI when the data transfer contains the file itself", async () => {
      const dataTransfer = createDataTransfer({
        'image/png': { file: { name: 'image.png', content: new Uint8Array([1]) } },
        'text/uri-list': { text: 'file:///tmp/image.png' },
      });

      await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(uploadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("when the provider shouldn't handle the drop", () => {
    it('ignores documents that are not comment inputs', async () => {
      const dataTransfer = createDataTransfer({
        'image/png': { file: { name: 'image.png', content: new Uint8Array([1]) } },
      });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(Uri.file('/folder/README.md')),
        position,
        dataTransfer,
        token,
      );

      expect(edit).toBe(undefined);
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it('ignores comment inputs of unknown comment controllers', async () => {
      asMock(commentControllerProvider.getMrContext).mockReturnValue(undefined);
      const dataTransfer = createDataTransfer({
        'image/png': { file: { name: 'image.png', content: new Uint8Array([1]) } },
      });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(edit).toBe(undefined);
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it('ignores data transfers without images', async () => {
      const dataTransfer = createDataTransfer({ 'text/plain': { text: 'hello' } });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(edit).toBe(undefined);
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it('shows an error and inserts nothing when the upload fails', async () => {
      uploadFile.mockRejectedValue(new Error('401 Unauthorized'));
      const dataTransfer = createDataTransfer({
        'image/png': { file: { name: 'image.png', content: new Uint8Array([1]) } },
      });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(edit).toBe(undefined);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Couldn't upload the image to the gitlab-org/gitlab project.",
        'Show Logs',
      );
    });

    it('refuses an image larger than 10 MB without uploading it', async () => {
      const dataTransfer = createDataTransfer({
        'image/png': { file: { name: 'big.png', content: new Uint8Array(MAX_IMAGE_BYTES + 1) } },
      });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(edit).toBe(undefined);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'The image big.png is larger than 10 MB.',
        'Show Logs',
      );
    });

    it('refuses a content type that is not a single image type', async () => {
      const dataTransfer = createDataTransfer({
        'image/png\r\nX-Injected: 1': { file: { name: 'a.png', content: new Uint8Array([1]) } },
      });

      const edit = await provider.provideDocumentDropEdits(
        createDocument(commentUri()),
        position,
        dataTransfer,
        token,
      );

      expect(edit).toBe(undefined);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'a.png is not an image.',
        'Show Logs',
      );
    });
  });

  describe('paste edits', () => {
    const kind = { value: 'markdown.link.image.gitlabUpload' } as PasteEditKind;
    const dataTransfer = () =>
      createDataTransfer({
        'image/png': { file: { name: 'image.png', content: new Uint8Array([1]) } },
      });

    it('creates a paste edit with the uploaded image markdown', async () => {
      const pasteApi: DocumentPasteApi = {
        createKind: () => kind,
        createEdit: (insertText, title, editKind) => ({ insertText, title, kind: editKind }),
        registerProvider: jest.fn(),
      };

      const edits = await new CommentAttachmentProvider(pasteApi).provideDocumentPasteEdits(
        createDocument(commentUri()),
        [],
        dataTransfer(),
        undefined,
        token,
      );

      expect(edits).toEqual([
        {
          insertText: '![image.png](/uploads/hash/image.png)',
          title: 'Upload image to GitLab',
          kind,
        },
      ]);
    });

    it("doesn't provide paste edits when VS Code doesn't support them", async () => {
      const edits = await provider.provideDocumentPasteEdits(
        createDocument(commentUri()),
        [],
        dataTransfer(),
        undefined,
        token,
      );

      expect(edits).toBe(undefined);
      expect(uploadFile).not.toHaveBeenCalled();
    });
  });
});
