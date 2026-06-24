# orz-mdhtml

Generate **self-contained, editable `.md.html` files** from Markdown, powered by
[orz-markdown](https://www.npmjs.com/package/orz-markdown).

A `.md.html` file is a **document first, quietly editable**:

1. is a valid HTML page that opens in any browser;
2. by default it reads like a normal themed webpage (the rendered document fills
   an isolated `<iframe>`) with a single small **edit** button — a reader never
   notices the editor;
3. clicking it reveals a minimal editor — **CodeMirror** source beside a live
   preview that updates **incrementally** (morphdom: only changed nodes repaint,
   scroll preserved, no reload). Resizable split, editor/split/preview views;
4. lets you switch among orz-markdown's **built-in themes** live (chrome, editor
   and preview all follow the theme's light/dark scheme);
5. copies the **Markdown source** when you select & copy rendered content
   (orz-markdown's core copy-as-markdown runs inside the preview frame);
6. saves itself in place (Chromium File System Access API) or as a download.

"Self-contained" means *works as one file* — fetching the renderer, themes, and
editor libraries (CodeMirror, Split.js, morphdom) over the internet is fine.
Editor libraries are **lazy-loaded on first edit**, so reading stays light.

## Status

Working end to end: generator, document-first UI (read / edit), iframe preview
with full theme isolation, incremental live updates, theme picker, copy-as-
markdown, and self-reproducing save. Browser-validated.

## Quick start

```bash
npm install
npm run bundle          # build dist/orzmd.browser.js (the in-browser renderer)
npm run gen -- path/to/doc.md          # → path/to/doc.md.html (inline renderer)
npm run gen -- path/to/doc.md --cdn    # → references jsDelivr (after publish)
open path/to/doc.md.html
```

## Design decisions

- **Renderer delivery = CDN, cached (Delivery C).** Each file references a
  versioned, immutable jsDelivr URL (`orz-mdhtml-browser@x.y.z`). Fetched once,
  then browser-cached (`immutable, max-age=1y`). `--inline` embeds the bundle
  for offline/no-publish use.
- **Version check.** Files pin an exact renderer version and, on open, query
  jsDelivr's resolved-version API (cached ~1 day). If a newer version exists, a
  non-blocking banner offers "Update & re-save". Stable by default, never
  silently broken.
- **In-place save** via the File System Access API (Chromium); download
  fallback elsewhere. The document is *self-reproducing*: Save rewrites the
  embedded `#orz-src` + pre-rendered preview and serializes itself.
- **Copy-as-markdown lives in orz-markdown core** (≥ 1.2.0), so every
  orz-markdown project inherits it. The render-time half emits `data-md`
  breadcrumbs on generated constructs (math, mermaid, qr, youtube) so they copy
  as meaningful content — e.g. a TOC copies its heading list, not `{{toc 2,3}}`.
  The runtime half is a bespoke DOM→Markdown walker in `browserRuntimeScript`,
  inlined into each `.md.html` via `getBrowserRuntimeScript()`. (The earlier
  Turndown stopgap has been removed.)

  Requires orz-markdown ≥ 1.2.0 (`"orz-markdown": "^1.2.0"`), where
  copy-as-markdown landed.

## Layout

```
src/browser-entry.ts   exposes window.orzmd.render() (bundled by esbuild)
build/bundle.ts        esbuild: orz-markdown -> dist/orzmd.browser.js
assets/app.js          in-file runtime (modes, copy, save, version check)
src/template.ts        builds the .md.html shell
src/cli.ts             CLI: foo.md -> foo.md.html
```

## Roadmap

- [x] Validate the esbuild browser bundle (markdown-it + katex + node-emoji).
- [x] Generate & open a real example end-to-end.
- [x] Port copy-as-markdown into orz-markdown core (`data-md` + DOM→md walker).
- [x] Depend on published `orz-markdown@^1.2.0` from npm.
- [ ] Mermaid/KaTeX re-render on edit; theme switcher parity with orz-markdown.
- [ ] Publish `orz-mdhtml-browser` to npm for Delivery C.
```
