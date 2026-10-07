# Changelog

All notable changes to **orz-mdhtml** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased] — 1.0.0

A rebuild on the orz-markdown carrier kit (orz text format 1; family plan
REBUILD §3a). **Breaking**: the 0.9 files, API and CLI shape are replaced.
Requires `orz-markdown ^2.2.0`.

### The new file

- A document is its **text twin** (`x.md`: Markdown with a `{{nyml kind:
  document}}` header — `carrier`, `uid`, `title`, `theme`, `measure`, `lang`,
  DocMeta keys) and its **self-editing file** `x.md.html` =
  `assemble(text)`. The file holds the exact text in its `#orz-src` island
  (BOM and line endings recorded), an agent banner, `#orz-shell`
  (`{ kind: "md", format: 1, shell, delivery }`), `#orz-meta` and the head
  metadata from the header, `#orz-includes` (includes resolved at assembly),
  and a regenerable shell. Node and the browser write the same bytes.
- **Read view in the page** (no iframe) with the header's theme and measure;
  content libraries load only when the document needs them.
- **Chrome** (orz-markdown `carrier/app`): Edit, theme and measure pickers
  (they write the header; undoable), Save, Download a copy, New document, Save
  as new copy; Cmd/Ctrl+S / E / Z; a warning before closing with unsaved
  changes. Saves always write `assemble(text)`, never the live DOM; a file
  handle is reused only when the file's content proves it is the opened file.
- **Editor**: the kit's editor shell (CodeMirror, live preview, view modes,
  reader preferences stored per document `uid`, never in the file).
- **Quiet update**: a local file checks once a day for a newer
  `orz-mdhtml-browser` (`release.json`, SHA-384-verified bundle) and offers
  *Update now*, which re-assembles the same text with the new release.
- **Hosts**: `orz-host-save@1`, `orz-host-ai@1` (an AI menu with a review
  panel; nothing changes until the reader applies) and `orz-host-include@1`;
  canonical spec in orz-markdown `spec/host-protocols.md` (PROTOCOL.md is now a
  pointer).
- **Inline by default**: the engine is inside the file; `--cdn` for small web
  files.

### CLI (breaking)

- New commands: `new`, `assemble` (also `orz-mdhtml x.md`), `extract`,
  `upgrade`, `inspect`, `themes`; `--json` on every command, exit codes 0/1/2,
  no overwriting of work without `--force`.
- Removed: `--theme` and `--title` on generation (content comes only from the
  header), and `--cdn` as the default.

### Library (breaking)

- New: `assemble`, `extract`, `readDocument`, `newDocument`, `inspect`,
  `upgrade`, `readLegacy`, `THEMES`, `DEFAULT_THEME`, `isThemeId`, `MEASURES`,
  `DEFAULT_MEASURE`, `VERSION`, `ORZ_MARKDOWN_VERSION`, `FORMATS`,
  `BUNDLE_FILE`, `cdnBundleUrl`, `engineSource`, `engineFiles`.
- Removed: the 0.9 API (`buildMdHtml`, `composeInlineMdHtml`,
  `findRendererBundle`, `findAsset`, `orzVersionOf`, `selfVersionOf`) and the
  0.x runtime (`assets/app.js`, `orzmd.browser.js`).

### orz-mdhtml-browser

- The IIFE `orz-mdhtml.browser.js` sets `globalThis.OrzCarrier` (FC-19:
  `assemble`, `extract`, `readDocument`, `mountEditor`, `renderPreview`) and
  boots an assembled file; a new ES module build (`esm/orz-mdhtml.browser.mjs`)
  for web apps; `release.json`; types in `index.d.ts`. Embedding guide:
  `docs/embedding.md` (hooks, AI review flow, nonce CSP recipe).

### Migration

- 0.x files are not opened as they are: `orz-mdhtml upgrade old.md.html`
  writes a format-1 file and its text twin, keeping the source exactly and
  moving `#orz-meta`, the saved theme and the `<title>` into the header;
  `orz-mdhtml inspect` says what any file is and what to do.

## [0.9.3] — 2026-07-17

### Changed

- Depends on `orz-markdown ^1.6.3`; the bundled renderer (`orzmd.browser.js`)
  is rebuilt with it.
- README and agent skill lead with "Markdown that edits itself" /
  "single-file, self-editing"; npm description and homepage
  (`markdown.orz.how`) updated, the extra npm keywords of 0.9.1 dropped.

## [0.9.2] — 2026-07-16

### Changed

- npm package description only ("Markdown → one .md.html file that opens like
  a webpage and edits itself"). No code or file-format change.

## [0.9.1] — 2026-07-16

### Changed

- npm package metadata only: `repository`, `homepage` and `bugs` links and
  more keywords. No code or file-format change.

## [0.9.0] — 2026-07-11

### Added

- **`orz-host-include@1`** — the in-file editor now delegates URL-based markdown
  transclusion (`{{md-include https://…}}` / `{{markdown https://…}}`) to a
  trusted host for its PREVIEW render. When a host answers the hello, each
  distinct include URL is resolved by the host (which owns the fetch + its own
  allowlist) and inlined into the preview via a URL→markdown cache; the editable
  source keeps the directive. A **standalone file never resolves and never
  auto-fetches** an author URL from the viewer's browser — the directive is left
  in place. Sibling of `orz-host-save` / `orz-host-ai`; see PROTOCOL.md.

## [0.8.1] — 2026-07-11

### Fixed

- CDN and inline CLI generation now use the same composition path, so the
  default `--cdn` mode applies metadata extraction exactly like `--inline`.

### Security

- Updated the build-only `esbuild` dependency to `^0.28.1`.

### Packaging

- Ship the MIT license in both npm packages and include `PROTOCOL.md` in the CLI
  tarball so README and agent-skill links work after installation.

## [0.8.0] — 2026-07-11

### Added

- Portable document metadata. A source-level `{{nyml kind: meta}}` block is
  consumed at generation time and emitted as standard `<head>` tags plus an
  `#orz-meta` JSON island. Programmatic callers can pass `metadata` to
  `buildMdHtml`; host values win field by field. Requires `orz-markdown ^1.4.0`.

## [0.7.1] — 2026-07-08

### Fixed

- The 0.7.0 embedded agent-guide comment contained a literal
  `<script … id="orz-src">` string, which a regex source-extractor could match as
  if it were the real source island (extracting the comment instead of the
  Markdown). The guide now refers to the "embedded source island" in prose, with
  no tag literal. Runtime save (which reads the DOM element) was unaffected; this
  fixes host-side re-import/adapt extraction.

## [0.7.0] — 2026-07-08

### Added

- **Page-wide AI assistant.** Alongside the *Improve selection* chip, the editor
  toolbar gains an **AI button** (shown when the host advertises operations) that
  runs an operation on the **whole document** — review/rewrite the entire file,
  not just a selection. The AI popover now anchors to whatever opened it (the
  selection or the toolbar button).
- **Theme in the save handshake.** `orz-host-save` now includes the file's
  current **`theme`** (the selected theme id) in its save message, so a host can
  persist the reader/author's theme choice (e.g. as a course-wide default). Purely
  additive — hosts that ignore it are unaffected, and standalone save is unchanged.
- **Embedded agent guide.** Every generated `.md.html` carries an invisible HTML
  comment (top of `<body>`) telling an AI agent how to edit it — what the file is,
  where the editable source lives (`<script id="orz-src">`), the block-ID rules,
  and how to fetch the official orz-mdhtml agent skill
  (`https://cdn.jsdelivr.net/npm/orz-mdhtml/orz-mdhtml-skills/SKILL.md`). Invisible
  to readers; readable by any external AI app opening the file's source.

## [0.6.1] — 2026-07-08

### Fixed

- **AI assistant popover no longer runs off the bottom of the screen.** When the
  selection ended low in the viewport, the *Improve selection* menu / suggestion
  panel extended below the edge and was unreachable. It now measures itself and
  **flips above the selection** when it would overflow the bottom (and pins +
  scrolls if it fits neither). Positioning happens after the element is in the
  DOM, and re-runs when the suggestion loads (the panel grows).

## [0.6.0] — 2026-07-08

### Added

- **`orz-host-ai@1` — a host-provided AI assistant** (companion to
  `orz-host-save@1`, independent of it). When an embedding host advertises AI
  operations, the in-file editor shows a selection assistant: select text → an
  *"Improve selection"* chip → pick an operation → the passage is sent to the
  host → the returned suggestion is reviewed and applied into the CodeMirror
  selection. **The file owns the UI; the host owns the model** — so any host
  (Alembic, or a bring-your-own-key page) can offer AI. No host, no assistant;
  the standalone file is unchanged. Spec: [PROTOCOL.md](PROTOCOL.md).

No change to the rendered output or the `.md.html` format — the assistant is an
additive editor affordance, embedded per file in `assets/app.js`. The
`orz-mdhtml-browser` renderer bundle is unchanged (republished at the matching
version for the CDN pin).
