/**
 * GitLab stores uploaded attachments as project-relative links (`![image](/uploads/hash/image.png)`).
 * VS Code can only render absolute URLs, so we have to prepend the project URL
 * (e.g. `https://gitlab.com/group/project`) before we show the markdown to the user.
 */
export const makeMarkdownLinksAbsolute = (markdown: string, projectWebUrl: string): string =>
  markdown.replace(/\]\(\/uploads\//gm, `](${projectWebUrl}/uploads/`);
