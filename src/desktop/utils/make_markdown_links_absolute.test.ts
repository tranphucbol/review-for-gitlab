import { makeMarkdownLinksAbsolute } from './make_markdown_links_absolute';

describe('makeMarkdownLinksAbsolute', () => {
  const projectWebUrl = 'https://gitlab.com/group/project';

  it('replaces attachment links with absolute URL, including project path', () => {
    const relativeLink = 'Click [here](/uploads/1234hash/image.png).';

    expect(makeMarkdownLinksAbsolute(relativeLink, projectWebUrl)).toBe(
      'Click [here](https://gitlab.com/group/project/uploads/1234hash/image.png).',
    );
  });

  it('handles multiline strings', () => {
    const relativeLink = 'first line\nClick [here](/uploads/1234hash/image.png).';

    expect(makeMarkdownLinksAbsolute(relativeLink, projectWebUrl)).toMatch(
      'Click [here](https://gitlab.com/group/project/uploads/1234hash/image.png).',
    );
  });

  it('replaces all attachment links', () => {
    const relativeLinks = '![a](/uploads/hash1/a.png)\n![b](/uploads/hash2/b.png)';

    expect(makeMarkdownLinksAbsolute(relativeLinks, projectWebUrl)).toBe(
      '![a](https://gitlab.com/group/project/uploads/hash1/a.png)\n' +
        '![b](https://gitlab.com/group/project/uploads/hash2/b.png)',
    );
  });

  it('leaves already absolute attachment links alone', () => {
    const absoluteLink = 'Click [here](https://gitlab.com/group/project/uploads/hash/image.png).';

    expect(makeMarkdownLinksAbsolute(absoluteLink, projectWebUrl)).toBe(absoluteLink);
  });

  it('ignores non-attachment relative links', () => {
    const relativeLink = 'Click [here](/group/project/issues).';

    expect(makeMarkdownLinksAbsolute(relativeLink, projectWebUrl)).toBe(
      'Click [here](/group/project/issues).',
    );
  });
});
