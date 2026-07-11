# CLAUDE.md — orz-mdhtml

Guidance for AI agents working in this repository.

## What this is

`orz-mdhtml` turns a Markdown file into a single, self-contained, **editable**
`.md.html` — a page that reads like a normal themed website but can be edited and
saved in the browser. It is powered by [orz-markdown](../orz-markdown).

Two npm packages live here, **versioned in lockstep**:
- `orz-mdhtml` — the CLI (this package).
- `orz-mdhtml-browser` — the prebuilt in-browser renderer (`browser/`), served
  via jsDelivr for `--cdn` files.

## Commands

```bash
npm run build            # tsc && npm run bundle
npm run bundle           # esbuild: orz-markdown → dist/orzmd.browser.js (+ copies to browser/)
npm run gen -- doc.md    # generate doc.md.html (dev; same as the CLI)
npm run clean
```

There are no unit tests; **verify generated files in a real browser** (editing
and Save need Chromium). `build/serve.cjs` is a dependency-free static server
for that.

## Architecture

- `src/cli.ts` — CLI. Reads the `.md`, builds config, calls the shared
  `composeInlineMdHtml` path for both delivery modes.
  `orzVersion` = orz-markdown (for theme CDN URLs); `selfVersion` = this
  package (for the renderer bundle URL + version check). **`--cdn` is the
  default** (small files; renderer from jsDelivr); `--inline` embeds the bundle.
- `src/template.ts` — builds the outer `.md.html` shell: chrome (minimal
  light/dark), the preview `<iframe>`, the embedded source
  (`<script type="text/markdown" id="orz-src">`), config, and the inlined
  `assets/app.js`. Inline `<script>` payloads are `</script>`-escaped.
- `src/browser-entry.ts` — esbuild entry; exposes `window.orzmd.render()` and
  stamps `data-src-line` on blocks (for scroll-sync).
- `build/bundle.ts` — esbuild bundles orz-markdown for the browser (IIFE) →
  `dist/orzmd.browser.js`, then copies it into `browser/`. Browser-incompatible
  bits are shimmed in `build/shims/` (`fs`, `path`, the imsize fs reader).
- `assets/app.js` — **the in-file runtime, plain JS** inlined into every
  `.md.html`. View/edit (slide-in popout) modes, iframe build, **morphdom**
  incremental preview, themes, scroll-sync (+toggle), save (FS Access API +
  IndexedDB handle reuse), export, the served-page save notice, and the
  **host-embedding save hook** (`orz-host-save@1`, spec in `PROTOCOL.md` —
  canonical for all three orz-family runtimes). Lazy-loads CodeMirror/morphdom
  on first edit.
- `browser/` — the `orz-mdhtml-browser` package (`package.json` + `README.md`;
  the bundle is staged in by `npm run bundle`).
- `orz-mdhtml-skills/` — the agent skill for using/creating `.md.html`.

## Conventions & gotchas

- **`assets/app.js` is plain JS** (backticks OK). It depends on element ids from
  `src/template.ts` (`#orz-src`, `#orz-frame`, `#orz-doc`, `#orz-editor`,
  `#orz-panel`, toolbar ids). Change them together.
- **Escape `</script>`** in anything inlined into a `<script>` (template.ts
  `escapeForScript`, app.js `guard`). The embedded source is stored with
  `</script>` → `<\/script>` and reversed at runtime.
- **The browser bundle embeds orz-markdown.** To pick up parser/runtime changes,
  bump the `orz-markdown` dep, `npm install`, then `npm run bundle`.
- **Preserve `data-md` and `data-src-line`** if you post-process rendered HTML
  (copy-as-markdown and scroll-sync depend on them).
- `{{nyml kind: meta}}` is consumed before rendering; normalized metadata lives
  in `<head>` and `#orz-meta`. Keep CDN and inline generation on the shared
  composition path so their metadata behavior cannot drift.
- **`dist/` and `browser/orzmd.browser.js` are gitignored** build artifacts;
  `browser/package.json` and `browser/README.md` are tracked.
- A generated file needs internet to view (renderer/themes/KaTeX/etc. from CDN);
  reading works in all modern browsers, **editing/Save only in Chromium**.

## Releasing (two packages, same version)

1. Bump **both** `package.json` and `browser/package.json` to the same version.
2. `npm run build` (stages `browser/orzmd.browser.js`).
3. `npm publish ./browser` (orz-mdhtml-browser) **first**, then `npm publish`
   (the CLI) — so `--cdn` URLs resolve.
4. Token: granular with **bypass-2FA** (and "create new packages" for a new
   name) in a temp `.npmrc`, **deleted after**; never commit.
5. **Network note**: IPv6 is unreliable on this machine — prefix npm/git network
   commands with
   `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"`.

## After each major revision

**Check coherency and update the README and the agent skill.** When you change
the CLI options, the in-file UI/runtime, delivery defaults, or the release flow,
make sure `README.md` and `orz-mdhtml-skills/SKILL.md` still match reality (and
that the orz-markdown dependency note is current). Stale docs/skill are bugs.

## Release

- Before each publishing, always check coherency and consistency, update docs and agent skills, update the example/sample/testing dual extension name files to current version.
