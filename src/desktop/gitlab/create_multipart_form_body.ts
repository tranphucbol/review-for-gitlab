import crypto from 'crypto';

export interface MultipartFile {
  /** name of the form field (e.g. `file`) */
  fieldName: string;
  fileName: string;
  contentType: string;
  content: Uint8Array;
}

export interface MultipartFormBody {
  /** value for the `Content-Type` header, it contains the generated boundary */
  contentType: string;
  body: Buffer;
}

const CRLF = '\r\n';

/**
 * The `escape` algorithm from the HTML spec
 * https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#multipart-form-data
 */
const escapeFormDataName = (name: string) =>
  name.replace(/\r\n|\r|\n/g, '%0D%0A').replace(/"/g, '%22');

/**
 * Creates a `multipart/form-data` body containing a single file.
 *
 * We can't use the global `FormData` object because in the Node environment,
 * `cross-fetch` delegates to `node-fetch@2`, which doesn't understand it.
 */
export const createMultipartFormBody = (
  file: MultipartFile,
  boundary = `----GitLabWorkflowBoundary${crypto.randomBytes(16).toString('hex')}`,
): MultipartFormBody => {
  // a line break would end the header and let the value write headers of its own
  if (/[\r\n]/.test(file.contentType)) {
    throw new Error(`The content type ${JSON.stringify(file.contentType)} contains a line break.`);
  }
  const header = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${escapeFormDataName(
        file.fieldName,
      )}"; filename="${escapeFormDataName(file.fileName)}"`,
      `Content-Type: ${file.contentType}`,
      '',
      '',
    ].join(CRLF),
  );
  const footer = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([header, Buffer.from(file.content), footer]),
  };
};
