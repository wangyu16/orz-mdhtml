# Embedding the orz-mdhtml editor in a web app

`orz-mdhtml-browser` is the editor that every `.md.html` file carries, packaged
for web apps (family decision FD-06; contract FC-19 in orz-markdown
`spec/FC-19-editor-component.md`). An app mounts it in its own page, keeps the
**text** (the canonical document, FC-18) wherever it likes, and makes
assembled `.md.html` files only when someone needs one.

A working example: [`examples/webapp/`](../examples/webapp/) — two editors on
one page with every hook, under a nonce Content-Security-Policy
(`index.html`, IIFE) and the ES module variant (`esm.html`). The test suite
runs both in real Chrome (`tests/webapp.test.ts`).

## Install and load

```sh
npm install orz-mdhtml-browser
```

| You want | Use | Resolves to |
|---|---|---|
| a bundler (Vite, esbuild, webpack) | `import { mountEditor } from 'orz-mdhtml-browser'` | `esm/orz-mdhtml.browser.mjs` (`exports` → `import`) |
| a plain `<script>` | `<script src=".../orz-mdhtml.browser.js">` → `globalThis.OrzCarrier` | `orz-mdhtml.browser.js` (`exports` → `default`) |
| the CDN | `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<version>/orz-mdhtml.browser.js` | the same IIFE |

Types: `orz-mdhtml-browser/index.d.ts` (`Editor`, `EditorOptions`,
`EditorHooks`, …). The ES module sets no global and boots nothing; the IIFE
sets `globalThis.OrzCarrier` and — only inside an assembled `.md.html` —
starts that file's own read view and chrome.

## Versions

**An app pins the component version it wants; files carry their own shells.**
Upgrading the package changes your editor, not anyone's files. The text format
(FC-18 format 1) is the only contract between them: a text written by any 1.x
editor opens in every other 1.x editor and assembles with any 1.x shell. The
quiet update indicator never appears in an app (FC-19 §5 invariant 6).

## Mount an editor

```ts
import { mountEditor } from 'orz-mdhtml-browser';

const editor = mountEditor(element, {
  text,                       // the document, exact (BOM, line endings kept)
  mode: 'split',              // 'split' | 'editor' | 'preview' (else the reader's stored preference)
  chrome: 'full',             // 'full' (labels) | 'compact' (icons) | 'none' (your UI drives the API)
  readOnly: false,
  nonce,                      // your CSP nonce (orz-mdhtml extension, see below)
  hooks: { save, ai, fetchInclude, resolveAsset, uploadAsset, resolveLink, mintUid },
  // preferences: your PreferenceStore (default: localStorage, namespaced by the header uid)
});
```

Any number of editors per page: each has its own undo history, preview frame
and preferences namespace; nothing is global. The chrome renders in a shadow
root (your CSS cannot break it; it cannot restyle your page); the preview runs
in a sandboxed `srcdoc` frame (`sandbox="allow-scripts"`, an opaque origin:
document scripts cannot reach your page, storage or cookies).

The toolbar has the view modes, the theme and measure pickers (they edit the
header: `theme`, `measure`), AI operations when `hooks.ai` offers some, the
save state and Save. Keyboard: Cmd/Ctrl+S saves, Cmd/Ctrl+\ cycles the modes,
Esc leaves the text for the toolbar.

### The `Editor` (FC-19 §4)

`getText()` · `setText(text, { resetHistory? })` · `setHeader(changes)` (one
undoable edit, FC-18 §9 rules) · `undo()` / `redo()` · `isDirty()` /
`markSaved()` · `save()` → `{ ok, via }`, never rejects · `setMode(m)` /
`getMode()` · `focus()` · `on('change' | 'dirty' | 'selection' | 'save' |
'error', fn)` → unsubscribe · `requestAi(op, { selection? })` ·
`uploadAssets(files)` · `ensureUid()` · `setReadOnly(flag)` / `isReadOnly()` ·
`destroy()`.

## Hooks (FC-19 §3)

| Hook | Called | Return |
|---|---|---|
| `save(text)` | on Save / Cmd+S / `editor.save()` | a promise; reject to report a failure (the editor stays dirty). **With `save`, you own persistence**: nothing is written to disk or downloaded |
| `ai.operations`, `ai.request(op, { text, selection? })` | the AI menu (reviewed before it applies), `editor.requestAi` | `{ proposed }` — replaces the selection or the whole text as one undoable edit |
| `fetchInclude(url)` | the preview meets `{{md https://…}}` / `{{markdown …}}` / `{{md-include …}}` | the Markdown, or `null`. Your trust policy (allowlist) decides |
| `resolveAsset(path)` | every relative `src` / `srcset` / `poster` in the preview | the URL to load (e.g. a signed URL of your storage) |
| `uploadAsset(file)` | a file pasted or dropped into the editor, `editor.uploadAssets` | the relative path to insert (`![name](path)` for images) |
| `resolveLink(href)` | a link clicked in the preview (as written, e.g. `week2.md`) | the URL to open |
| `mintUid()` | `editor.ensureUid()` when the header has no `uid` | a `doc-[0-9a-z]{10,32}` id from your registry (FC-18 §10) |

Without `hooks.save` the editor saves like a standalone file: an inline
`.md.html` through the File System Access picker, else a download.

## Content-Security-Policy (FC-19 §8.4)

The preview frame is a `srcdoc` frame: it inherits your page's policy. With a
nonce policy, pass the nonce as `nonce`: the component stamps it on
CodeMirror's `<script>` and `<style>` and on every script and style of the
preview frame. The example's policy:

```
default-src 'none';
script-src 'nonce-RANDOM' 'strict-dynamic';
style-src 'self' 'nonce-RANDOM' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com;
style-src-attr 'unsafe-inline';          (KaTeX and the diagram libraries write style attributes)
font-src https://cdn.jsdelivr.net https://fonts.gstatic.com data:;
img-src 'self' data: blob: https:;       (wherever resolveAsset points)
connect-src 'self' https://cdn.jsdelivr.net;
```

What loads from where: CodeMirror 6 from
`cdn.jsdelivr.net/npm/orz-markdown@<version>/vendor/codemirror6.js` (pinned,
SRI-checked; a textarea until it arrives); themes from
`cdn.jsdelivr.net/npm/orz-markdown@<version>/themes/`; KaTeX CSS from
jsDelivr, highlight.js from cdnjs, Mermaid / Chart.js from jsDelivr, SMILES
from unpkg (the preview libraries; with `'strict-dynamic'` the nonce covers
them). Mermaid inserts `<style>` elements at run time: allow them with
`style-src-elem 'unsafe-inline'` if your documents use diagrams.

## Without an editor

```ts
import { assemble, extract, readDocument, renderPreview } from 'orz-mdhtml-browser';

readDocument(text)                        // header + derived facts (title, author, uid, theme, lint) — no rendering; index with it
await renderPreview(text, { fetchInclude })            // the article's HTML, for a sandboxed read-only view
await renderPreview(text, { document: true })          // a whole script-free HTML document (iframe srcdoc, thumbnails)
await assemble(text, { delivery: 'cdn' })              // a small .md.html that loads the engine from jsDelivr
await assemble(text)                                   // an inline .md.html (fetches this release's bundle once, or pass engineSource)
await assemble(text, { includes })                     // with resolved includes in #orz-includes
extract(html)                                          // { text, kind, format, shell, delivery, includes } | null
```

`assemble` writes the same bytes as the Node library (`orz-mdhtml`), so an app
can publish, preview or download without a server. Store the text; regenerate
the HTML.

## Assembled files in an iframe

To show **assembled files** (untrusted or third-party `.md.html`) rather than
the component, embed them in a sandboxed iframe and speak the host protocols
(`orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`; orz-markdown
`spec/host-protocols.md`, host side `embedCarrierFrame` in
`orz-markdown/carrier/shell`). The file then saves to you, takes AI operations
and include resolution from you, and shows no update indicator.
