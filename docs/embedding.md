# Embedding the orz-mdhtml editor in a web app

`orz-mdhtml-browser` is the editor that every `.md.html` file carries, packaged
for web apps (family decision FD-06; contract FC-19 in orz-markdown
`spec/FC-19-editor-component.md`). An app mounts it in its own page, keeps the
**text** (the canonical document, FC-18) wherever it likes, and makes
assembled `.md.html` files only when someone needs one.

This guide ships in both packages (`node_modules/orz-mdhtml-browser/docs/embedding.md`,
`node_modules/orz-mdhtml/docs/embedding.md`). A working example:
[`examples/webapp/`](https://github.com/wangyu16/orz-mdhtml/tree/main/examples/webapp) — two editors on
one page with every hook, under a nonce Content-Security-Policy
(`index.html`, IIFE) and the ES module variant (`esm.html`). The test suite
runs both in real Chrome (`tests/webapp.test.ts`).

## Install and load

```sh
npm install orz-mdhtml-browser@1   # or: npm i orz-mdhtml-browser@1
```

| You want | Use | Resolves to |
|---|---|---|
| a bundler (Vite, esbuild, webpack) | `import { mountEditor } from 'orz-mdhtml-browser'` | `esm/orz-mdhtml.browser.mjs` (`exports` → `import`) |
| a plain `<script>` | `<script src=".../orz-mdhtml.browser.js">` → `globalThis.OrzCarrier` | `orz-mdhtml.browser.js` (`exports` → `default`) |
| `require()` | not supported: it throws, pointing to `import` or `<script>` | `require.cjs` (`exports` → `require`) |
| the CDN | `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<version>/orz-mdhtml.browser.js` (e.g. `@1.0.0`; pin an exact version) | the same IIFE |

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
  nonce,                      // your CSP nonce (FC-19 §3, see below)
  includes,                   // resolved includes for the preview: { 'parts/a.md': text, 'https://…': text } (FC-19 §3)
  fileName: 'notes.md.html',  // the suggested name of saves without hooks.save (picker, download); default document.md.html
  hooks: { save, ai, fetchInclude, resolveAsset, uploadAsset, resolveLink, mintUid },
  // preferences: your PreferenceStore (default: localStorage, namespaced by the header uid)
});
```

Any number of editors per page: each has its own undo history, preview frame
and preferences namespace; nothing is global. The chrome renders in a shadow
root (your CSS cannot break it; it cannot restyle your page); the preview runs
in a sandboxed `srcdoc` frame (`sandbox="allow-scripts"`, an opaque origin:
document scripts cannot reach your page, storage or cookies).

The toolbar has the view modes, the Theme and Width pickers (they edit the
header: `theme`, `measure`), an **AI** menu when `hooks.ai` offers operations,
the save state and Save. `chrome: 'compact'` shows the same tools as icons. Keyboard: Cmd/Ctrl+S saves, Cmd/Ctrl+\ cycles the modes,
Esc leaves the text for the toolbar.

### The `Editor` (FC-19 §4)

`getText()` · `setText(text, { resetHistory? })` · `setHeader(changes)` (one
undoable edit, FC-18 §9 rules) · `undo()` / `redo()` · `isDirty()` /
`markSaved()` · `save()` → `{ ok, via, error?, conflict? }` (`via`: `hook`, `host`,
`file`, `download`), never rejects · `setMode(m)` / `getMode()` · `focus()` ·
`on('change' | 'dirty' | 'selection' | 'save' | 'error', fn)` → unsubscribe ·
`proposeAi(op, { selection? })` / `applyAi(proposal, { proposed? })` (the
review flow, below) · `requestAi(op, { selection? })` (propose and apply at
once) · `uploadAssets(files)` · `ensureUid()` · `setReadOnly(flag)` /
`isReadOnly()` · `refreshPreview({ includes? })` (render now; with `includes`
the preview's include record is replaced and every include read again — e.g.
after your app resolved one; saves keep the mounted includes) · `ready` (a
promise: the text engine is final, `{ engine: 'codemirror6' }` or
`{ engine: 'textarea', error }`; the editor is usable before) · `destroy()`.

### AI with a review step

The toolbar's AI menu never changes the document by itself. Choosing an
operation calls `proposeAi`: your `hooks.ai.request` runs and the editor gets
a **proposal** (`{ op, proposed, range, original, passage }`) without touching
the text. A review panel shows it — editable — with Apply and Cancel; Apply
calls `applyAi(proposal, { proposed })`, which writes it as **one undoable
edit**, and refuses (`{ ok: false }`) if the text changed since the proposal
was made. Your own UI can run the same flow:

```ts
const r = await editor.proposeAi('tighten', { selection: true });
if (r.ok && await myConfirm(r.proposal.original, r.proposal.proposed)) editor.applyAi(r.proposal);
```

## Hooks (FC-19 §3)

| Hook | Called | Return |
|---|---|---|
| `save(text)` | on Save / Cmd+S / `editor.save()` | a promise; reject to report a failure (the editor stays dirty). **With `save`, you own persistence**: nothing is written to disk or downloaded |
| `ai.operations`, `ai.request(op, { text, selection? })` | the AI menu and `editor.proposeAi` (the proposal is reviewed before `applyAi` writes it), `editor.requestAi` | `{ proposed }` — the replacement of the selection (`selection: true` operations) or of the whole text |
| `fetchInclude(target)` | the preview meets an include `includes` lacks: a URL (`{{md https://…}}` / `{{markdown …}}` / `{{md-include …}}`), or a file include's path as written (`{{md parts/a.md}}` → `'parts/a.md'`; you read your own files) | the Markdown, or `null`. Your trust policy (allowlist) decides |
| `resolveAsset(path)` | every relative `src` / `srcset` / `poster` in the preview, **synchronously** (the preview does not wait) | the URL to load, as a string — not a promise: a URL your app already knows (a `blob:` URL of a stored asset, a public URL, a URL signed beforehand) |
| `uploadAsset(file)` | a file pasted or dropped into the editor, `editor.uploadAssets` | the relative path to insert (`![name](path)` for images) |
| `resolveLink(href)` | a link clicked in the preview (as written, e.g. `week2.md`) | the URL to open |
| `mintUid()` | `editor.ensureUid()` when the header has no `uid` | a **promise** of a `doc-[0-9a-z]{10,32}` id from your registry (FC-18 §10) |

**Includes.** The preview reads an include from the `includes` option first
(target as written → text, like an assembled file's `#orz-includes`), then
asks `hooks.fetchInclude` — with the URL, or with the path as written for a
file include `includes` lacks. An include neither answers shows a quiet
"Included file not available: parts/a.md" note in the preview (the directive
is kept; a printed page hides the note).

Without `hooks.save` the editor saves like a standalone file: an inline
`.md.html` (holding the `includes` you passed) through the File System Access
picker, else a download. Your app's page is not a served file: such a save
never shows the "opened from a web address" notice, even over https. If the
picked file is another copy of this document (same header `uid`) whose text
changed on disk since the editor opened it (another program or an agent
edited it), nothing is written: `save()` resolves `{ ok: false, via: 'file',
error: 'conflict', conflict: true }` and the editor asks the reader — **Replace
it** writes the file, **Download a copy instead** downloads one. (Mounted
inside an assembled `.md.html` page, it is an editor of that file: it saves
through the file's own saver, delivery, includes and host — with the same
conflict question — the page's Cmd/Ctrl+S saves it, and its unsaved changes
make the page ask before it closes.)

## Content-Security-Policy (FC-19 §8.4)

The preview frame is a `srcdoc` frame: it inherits your page's policy. With a
nonce policy, pass the nonce as `nonce` (FC-19 §3): the component stamps it on
CodeMirror's `<script>` and `<style>` and on every script and style of the
preview frame. Without it, a nonce or hash policy blocks the preview frame's
inline scripts and the editor reports it (`error` event, source `render`).
The example's policy:

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
await renderPreview(text, { includes, fetchInclude })  // the article's HTML, for a sandboxed read-only view (includes as in the editor)
await renderPreview(text, { document: true })          // a whole HTML document with the header's stylesheets (iframe srcdoc, thumbnails)
await assemble(text, { delivery: 'cdn' })              // a small .md.html that loads the engine from jsDelivr
await assemble(text)                                   // an inline .md.html (fetches this release's bundle once, or pass engineSource)
await assemble(text, { includes })                     // with resolved includes in #orz-includes
extract(html)                                          // { text, kind, format, shell, delivery, includes } | null
```

`renderPreview` adds no script of its own, but it keeps the document's raw
HTML as written — a document can hold `<script>` and event handlers (documents
come from trusted sources; orz-markdown does not filter them). Show its output
only in a sandboxed frame (`<iframe sandbox srcdoc=…>`, without
`allow-same-origin`), never with `innerHTML` in your page.

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
