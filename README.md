# orz-mdhtml

Generate **self-contained, editable `.md.html` files** from Markdown, powered by
[orz-markdown](https://www.npmjs.com/package/orz-markdown).

A `.md.html` file:

1. is a valid HTML page that opens in any browser;
2. embeds its own Markdown source (single source of truth);
3. has two modes — **Preview** (default) and **Edit** (source + live preview side by side);
4. copies the **Markdown source** when you select & copy rendered content;
5. saves itself in place (Chromium) or as a download (everywhere else).

"Self-contained" means *works as one file* — fetching the renderer, themes, and
helper libraries over the internet is fine.

## Status

Early scaffold. Working: project structure, generator, in-file runtime
(modes / save / version-check), copy via a Turndown stopgap. In progress:
browser-bundle integration and a real example render.

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
- **Copy-as-markdown lives in orz-markdown core** (not here), so every
  orz-markdown project inherits it. The render-time half emits `data-md`
  breadcrumbs on generated constructs (math, mermaid, containers, resolved TOC)
  so they copy as meaningful content — e.g. a TOC copies its heading list, not
  `{{toc 2,3}}`. The runtime half is a bespoke DOM→markdown walker in
  `browserRuntimeScript`. This repo currently uses a Turndown stopgap pending
  that core work.

## Layout

```
src/browser-entry.ts   exposes window.orzmd.render() (bundled by esbuild)
build/bundle.ts        esbuild: orz-markdown -> dist/orzmd.browser.js
assets/app.js          in-file runtime (modes, copy, save, version check)
src/template.ts        builds the .md.html shell
src/cli.ts             CLI: foo.md -> foo.md.html
```

## Roadmap

- [ ] Validate the esbuild browser bundle (markdown-it + katex + node-emoji).
- [ ] Generate & open a real example end-to-end.
- [ ] Mermaid/KaTeX re-render on edit; theme switcher parity with orz-markdown.
- [ ] Port copy-as-markdown into orz-markdown core (`data-md` + DOM→md walker).
- [ ] Publish `orz-mdhtml-browser` to npm for Delivery C.
```
