import * as vscode from 'vscode';
import path from 'path';
import { commentControllerProvider, MrCommentContext } from './comment_controller_provider';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { UploadedFile } from '../gitlab/gitlab_service';
import { handleError } from '../../common/errors/handle_error';
import { UserFriendlyError } from '../errors/user_friendly_error';
import { log } from '../../common/log';
import {
  DocumentPasteApi,
  getDocumentPasteApi,
  PasteEdit,
  PasteEditProvider,
  PasteEditKind,
} from './document_paste_api';

export const COMMENT_URI_SCHEME = 'comment';

const IMAGE_MIME_PREFIX = 'image/';
const URI_LIST_MIME = 'text/uri-list';

const CONTENT_TYPE_FOR_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpe': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
};

const EDIT_TITLE = 'Upload image to GitLab';
const PASTE_EDIT_KIND = ['markdown', 'link', 'image', 'gitlabUpload'];

/** Used to name files that the data transfer doesn't name (e.g. an image from the clipboard). */
const EXTENSION_FOR_CONTENT_TYPE: Record<string, string> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
};

const extensionForContentType = (contentType: string) =>
  EXTENSION_FOR_CONTENT_TYPE[contentType] ?? '.png';

const contentTypeForUri = (uri: vscode.Uri): string | undefined =>
  CONTENT_TYPE_FOR_EXTENSION[path.posix.extname(uri.path).toLowerCase()];

/** A file that we are going to upload to GitLab. */
interface Attachment {
  name: string;
  contentType: string;
  read: () => Promise<Uint8Array>;
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * VS Code creates the comment input box as a text document with the
 * `comment://<comment controller id>/<extension id>/commentinput-<n>.md` URI.
 */
export const getMrContextForCommentUri = (uri: vscode.Uri): MrCommentContext | undefined => {
  if (uri.scheme !== COMMENT_URI_SCHEME) return undefined;
  return (
    commentControllerProvider.getMrContext(uri.authority) ??
    commentControllerProvider.getMrContext(safeDecode(uri.authority))
  );
};

const attachmentsFromFiles = (dataTransfer: vscode.DataTransfer): Attachment[] => {
  const attachments: Attachment[] = [];
  dataTransfer.forEach((item, mimeType) => {
    if (!mimeType.startsWith(IMAGE_MIME_PREFIX)) return;
    const file = item.asFile();
    if (!file) return;
    attachments.push({
      name: file.name || `image${extensionForContentType(mimeType)}`,
      contentType: mimeType,
      read: async () => file.data(),
    });
  });
  return attachments;
};

/** Handles images dragged (or copied) from the OS file manager and the VS Code explorer. */
const attachmentsFromUriList = async (dataTransfer: vscode.DataTransfer): Promise<Attachment[]> => {
  const uriList = await dataTransfer.get(URI_LIST_MIME)?.asString();
  if (!uriList) return [];

  return uriList
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.startsWith('#'))
    .reduce<vscode.Uri[]>((uris, line) => {
      try {
        return [...uris, vscode.Uri.parse(line, true)];
      } catch {
        return uris;
      }
    }, [])
    .reduce<Attachment[]>((attachments, uri) => {
      const contentType = contentTypeForUri(uri);
      if (!contentType) return attachments;
      return [
        ...attachments,
        {
          name: path.posix.basename(uri.path),
          contentType,
          read: async () => vscode.workspace.fs.readFile(uri),
        },
      ];
    }, []);
};

const getAttachments = async (dataTransfer: vscode.DataTransfer): Promise<Attachment[]> => {
  const files = attachmentsFromFiles(dataTransfer);
  // pasting a file usually contains both, the file itself and its URI, we don't want to upload it twice
  return files.length > 0 ? files : attachmentsFromUriList(dataTransfer);
};

const uploadAttachments = async (
  { mr, projectInRepository }: MrCommentContext,
  attachments: Attachment[],
): Promise<string> => {
  const gitlabService = getGitLabService(projectInRepository);

  const uploaded = await Promise.all(
    attachments.map(async attachment => {
      const file: UploadedFile = {
        name: attachment.name,
        contentType: attachment.contentType,
        content: await attachment.read(),
      };
      // the note is created in the MR's project, that's the project the upload has to belong to
      return gitlabService.uploadFile(mr.project_id, file);
    }),
  );

  return uploaded.map(u => u.markdown).join('\n');
};

/**
 * Uploads all images from the data transfer to the MR project and returns
 * the markdown that references them. Returns `undefined` (and lets other providers
 * handle the paste or drop) when the document isn't a GitLab MR comment input,
 * when the data transfer contains no image, or when the upload fails.
 */
const getMarkdownForUploadedImages = async (
  document: vscode.TextDocument,
  dataTransfer: vscode.DataTransfer,
  token: vscode.CancellationToken,
): Promise<string | undefined> => {
  const mrContext = getMrContextForCommentUri(document.uri);
  if (!mrContext) return undefined;

  const attachments = await getAttachments(dataTransfer);
  if (attachments.length === 0 || token.isCancellationRequested) return undefined;

  try {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `Uploading ${attachments.length === 1 ? 'image' : 'images'} to GitLab`,
      },
      () => uploadAttachments(mrContext, attachments),
    );
  } catch (e) {
    handleError(
      new UserFriendlyError(
        `Couldn't upload the image to the ${mrContext.projectInRepository.project.namespaceWithPath} project.`,
        e,
      ),
    );
    return undefined;
  }
};

/**
 * Uploads images that the user pastes or drops into the MR comment input box
 * and inserts GitLab markdown that references them.
 *
 * Without this provider, the built-in Markdown paste handler tries to save the image
 * next to the "document" the user is editing. That fails because the comment input box
 * lives on the `comment:` URI scheme, which has no file system provider.
 */
export class CommentAttachmentProvider
  implements vscode.DocumentDropEditProvider, PasteEditProvider
{
  #pasteApi?: DocumentPasteApi;

  #pasteEditKind?: PasteEditKind;

  #getMarkdown: typeof getMarkdownForUploadedImages;

  constructor(pasteApi?: DocumentPasteApi, getMarkdown = getMarkdownForUploadedImages) {
    this.#pasteApi = pasteApi;
    this.#pasteEditKind = pasteApi?.createKind(...PASTE_EDIT_KIND);
    this.#getMarkdown = getMarkdown;
  }

  provideDocumentDropEdits = async (
    document: vscode.TextDocument,
    _position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentDropEdit | undefined> => {
    const markdown = await this.#getMarkdown(document, dataTransfer, token);
    return markdown ? new vscode.DocumentDropEdit(markdown) : undefined;
  };

  provideDocumentPasteEdits = async (
    document: vscode.TextDocument,
    _ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: unknown,
    token: vscode.CancellationToken,
  ): Promise<PasteEdit[] | undefined> => {
    const createEdit = this.#pasteApi?.createEdit;
    const kind = this.#pasteEditKind;
    if (!createEdit || !kind) return undefined;

    const markdown = await this.#getMarkdown(document, dataTransfer, token);
    return markdown ? [createEdit(markdown, EDIT_TITLE, kind)] : undefined;
  };
}

export const registerCommentAttachmentProviders = (context: vscode.ExtensionContext) => {
  const selector: vscode.DocumentSelector = { scheme: COMMENT_URI_SCHEME };
  const pasteApi = getDocumentPasteApi();
  const provider = new CommentAttachmentProvider(pasteApi);

  context.subscriptions.push(vscode.languages.registerDocumentDropEditProvider(selector, provider));

  if (!pasteApi) {
    log.info(
      'This VS Code version does not support paste providers, pasting images into GitLab comments is disabled.',
    );
    return;
  }

  context.subscriptions.push(
    pasteApi.registerProvider(selector, provider, {
      providedPasteEditKinds: [pasteApi.createKind(...PASTE_EDIT_KIND)],
      pasteMimeTypes: [`${IMAGE_MIME_PREFIX}*`, URI_LIST_MIME],
    }),
  );
};
