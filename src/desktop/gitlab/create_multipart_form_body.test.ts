import { createMultipartFormBody } from './create_multipart_form_body';

describe('createMultipartFormBody', () => {
  const file = {
    fieldName: 'file',
    fileName: 'image.png',
    contentType: 'image/png',
    content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  };

  it('creates a content type header with the boundary', () => {
    const { contentType } = createMultipartFormBody(file, 'BOUNDARY');

    expect(contentType).toBe('multipart/form-data; boundary=BOUNDARY');
  });

  it('creates a body with the file part', () => {
    const { body } = createMultipartFormBody(file, 'BOUNDARY');

    expect(body.toString('binary')).toBe(
      '--BOUNDARY\r\n' +
        'Content-Disposition: form-data; name="file"; filename="image.png"\r\n' +
        'Content-Type: image/png\r\n' +
        '\r\n' +
        '\x89PNG\r\n' +
        '--BOUNDARY--\r\n',
    );
  });

  it('keeps the binary content intact', () => {
    const content = new Uint8Array([0, 255, 13, 10, 42]);

    const { body } = createMultipartFormBody({ ...file, content }, 'BOUNDARY');

    const contentStart = body.indexOf('\r\n\r\n') + 4;
    expect([...body.subarray(contentStart, contentStart + content.length)]).toEqual([...content]);
  });

  it('escapes quotes and newlines in the file name', () => {
    const { body } = createMultipartFormBody({ ...file, fileName: 'we"ird\nname.png' }, 'BOUNDARY');

    expect(body.toString()).toContain('filename="we%22ird%0D%0Aname.png"');
  });

  it('generates a unique boundary by default', () => {
    const first = createMultipartFormBody(file);
    const second = createMultipartFormBody(file);

    expect(first.contentType).not.toBe(second.contentType);
  });
});
