# 011 - Mermaid renders lazily in the Overview

**Status:** accepted - 2026-10-17
**Status:** failure line reworded by [012](012_the-webviews-and-commands-share-one-look-and-voice.md) - 2026-10-18

**Plan:**
[docs/plans/006_modern-overview-webview.md](../plans/006_modern-overview-webview.md)
records the detailed investigation and implementation path.

## Context

Merge request descriptions and comments carry Mermaid diagrams. GitLab 13.12
renders them only in the browser, with its own client-side Mermaid; the HTML its
API returns holds the source in a `code.js-render-mermaid` block, and the
Overview's local Markdown render produces `code.language-mermaid`. In the
Overview both showed as raw source.

The decision is constrained by:

- The host's webview CSP is nonce-only for scripts and has no `frame-src`; the
  host does not change (decision
  [010](010_the-overview-is-themed-by-vs-code-tokens.md)).
- Only `dist/<webview>/` is copied into the `.vsix`
  (`scripts/utils/common_jobs.mjs`); a file Vite writes anywhere else is not
  shipped.
- Diagram text comes from merge request authors; it must not run script.
- Most Overviews have no diagram and should not pay for Mermaid.

## Evidence

`mermaid` 11.17.2, Vite 4, 2026-10-17. Sizes from `npm run package` with the
rest of the Overview change already in place.

| Check                                                                   | Result                                                                                                           | Consequence                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `.vsix` before and after                                                | 6,297,052 → 8,229,392 bytes (+1.93 MB, +31%); 69 → 145 files                                                     | the cost is paid in download size, not in Overview start-up     |
| `dist/issuable/assets/` before and after                                | 424K → 3.9M, 78 files; largest chunks mermaid-parser 691 kB, mermaid core 664 kB, cytoscape 444 kB, katex 259 kB | none of it is in `app.js` (~422 kB)                             |
| Default `modulePreload`                                                 | chunks reference `"/" + dep` and an `issuable/assets/index.css` preload                                          | absolute paths a webview cannot resolve; `modulePreload: false` |
| `import('mermaid')` under `script-src 'nonce-…'` in headless Chromium   | chunks load, no CSP violation                                                                                    | no CSP change, no `inlineDynamicImports` fallback               |
| Three fences: flowchart, broken flowchart, sequence                     | rendered, error, rendered; error line `Diagram could not be rendered: Parse error on line 4:`                    | one bad diagram does not stop the next                          |
| Switch the body from `vscode-dark` to `vscode-light` with new variables | rendered diagrams re-rendered in the new colours                                                                 | the theme observer works without a reload                       |
| DOMPurify on Mermaid's SVG without `HTML_INTEGRATION_POINTS`            | HTML node labels inside `foreignObject` dropped                                                                  | `foreignObject` is an allowed integration point                 |

## Decision

Mermaid blocks in the Overview render to sanitised inline SVG, from a lazily
loaded chunk, only when a block is on or near the screen.

- **Where.** `issuable/src/utils/mermaid.js` exports `renderMermaidBlocks(root)`;
  the `safe_html` directive calls it after `linkJiraKeys(el)`, so the same path
  covers descriptions, comments and the local-then-server render. It matches
  `code.js-render-mermaid`, `pre[lang="mermaid"] > code` and
  `code.language-mermaid`, and reads the source from `textContent`.
- **Loading.** The first block triggers `import('mermaid')`. Vite writes the
  chunks as `${name}/assets/[name]-[hash].js` with `modulePreload: false`, so
  they ship with the webview and load through `import()` alone. A chunk that
  fails to load is logged once and never retried; the code stays.
- **Rendering.** Each block is wrapped in a `figure.mermaid-diagram` and
  rendered one at a time when an `IntersectionObserver` (200px margin) sees it.
  Mermaid runs with `securityLevel: 'strict'`, `maxTextSize: 50000`, and the
  output passes DOMPurify's SVG profiles before it is inserted. Results are
  cached by theme and source (50 entries). Mermaid's temporary elements are
  removed from `body`.
- **Theme.** Theme variables are read from the `--vscode-*` values on `body`; if
  any is empty, Mermaid's own `dark` or `default` theme is used. A change to the
  body class that changes those values re-renders what is on screen.
- **Failure.** The code block stays visible with one muted line, `Diagram could
not be rendered: <first line>`, set through `textContent`.
- **Toolbar.** **Show source / Show diagram** and **Copy source**, shown on hover
  or focus.
- **Jira.** `SVG` joins `SKIPPED_ELEMENTS` in `jira_links.js`, so diagram text
  is never relinked.

```text
v-safe-html -> DOMPurify -> linkJiraKeys -> renderMermaidBlocks
  -> figure (pending) -> IntersectionObserver -> queue -> import('mermaid')
  -> mermaid.render (strict) -> DOMPurify SVG -> figure (rendered | error)
```

## Consequences

- Diagrams in descriptions and comments are readable in the editor's theme; an
  Overview without one loads no Mermaid code.
- The `.vsix` grows by about 1.9 MB, and `mermaid` (MIT) becomes a runtime
  dependency of the webview package.
- Diagrams render with Mermaid 11, not the Mermaid 8 GitLab 13.12 uses in the
  browser; a diagram written for Mermaid 8 renders, but its layout can differ
  from the web page, and newer syntax renders here but not on GitLab.
- Revisit when CI moves to Node 22.12 or later (`mermaid@12` needs it), when
  the host CSP changes, or when the `.vsix` size becomes a constraint.

## Alternatives rejected

- **Render on the host.** The extension host has no DOM, and Mermaid needs one.
- **Use GitLab's rendering.** GitLab 13.12 renders Mermaid only in the browser;
  its API returns the source.
- **A sandboxed iframe.** Needs a `frame-src` change to the host's CSP and a
  second document to theme and size.
- **Bundle Mermaid into `app.js`.** Every Overview would load about 3 MB of
  JavaScript for diagrams most do not have.
