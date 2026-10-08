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
- Known states instead of `--force`: an output holding the text the CLI last
  wrote or read for the pair (`x.md` and `x.md.html` or any `-o` path), a
  committed version of the twin in git, or the caller's `--replaces <sha256>`
  (the `sha256` every command prints) is replaced without `--force`; refusals
  carry a stable `reason` and a `next` command built from the caller's own
  arguments. `assemble` keeps an existing file's delivery and includes (stale
  includes are reported). `--force` keeps `<file>~`, never overwriting an
  earlier backup (`<file>~1`, `~2`, …).
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

### Safety (closed loop, round 1)

- `assemble` refuses whenever the existing `.md.html` holds a different text
  than the one assembled — also when the text twin is the newer file (a
  browser save followed by an agent's edit was silently lost) — with advice
  naming `extract` and `--force`; mixed line endings no longer count as a
  difference. `--force` keeps every replaced file as `<file>~`.
- `inspect` reports the sibling twin (same text or not, which is newer) and a
  file's structure (a cut island, a missing `</html>`, an inline engine that
  is not its release's); `extract` warns on a cut-off file.
- `assemble` keeps the includes the existing file holds (`--no-includes`
  drops them), `--resolve-includes` reads file includes from the text's
  folder only, and unresolved includes are warnings.
- `upgrade` never downgrades a newer shell (unless `--force`) and never
  writes over another document at `-o` without `--force`.
- Files are written through a temporary file and a rename keeping their
  mode; a symbolic link stays a link.
- A 0.x island wrapped in `\r\n…\r\n` (a converted file) is read.
- The page shows its document at once when a CDN hangs (the stylesheets no
  longer block the engine) and holds a one-line fallback until the engine
  runs.
- `orz-mdhtml-browser`: pure-ASCII bundles, a `prepublishOnly` check of
  `release.json` against the files, a `require` shim that throws a clear
  error, `standalone` in the types, `docs/embedding.md` shipped (also in
  `orz-mdhtml`); an app's own `hooks.ai` gets the AI menu in an editor
  mounted on a file without host AI.

### The kit's round-1 fixes (orz-markdown 2.2.0 carrier kit, `c271284`)

- **A save never silently overwrites a file changed on disk**: when the
  picked file is this document's (same `uid`) and its text changed since the
  page opened it (another program, an agent, `assemble --force`), nothing is
  written and the reader is asked — *Replace it* / *Download a copy instead*
  (`save()` → `{ ok: false, via: 'file', error: 'conflict', conflict: true }`).
- **Smoother `assemble`**: no `--force` needed when the existing `.md.html`
  holds a known earlier state of the twin — its last commit or staged
  version in git, or the text the CLI itself last wrote into the file or
  read out of it (`new --html`, `assemble`, `extract`, `upgrade` keep a
  SHA-256 per pair in `$XDG_CACHE_HOME/orz-mdhtml/`, else
  `~/.cache/orz-mdhtml/`). Any other text (a browser save in between) is
  refused as before. `--json` adds `replaced`; `inspect` adds `twin.earlier`.
- `mountEditor` takes FC-19 §3 `includes` (the preview reads them first;
  without `hooks.save` they go into the saved file); `fetchInclude` also gets
  a file include's path when `includes` lacks it; an include nothing resolves
  is a quiet "Included file not available" note (read view and preview).
- An app's editor without `hooks.save` saves through the picker or a
  download, never the served-page notice; in edit mode Cmd/Ctrl+S with the
  focus on the chrome saves the editor; the chrome is first in the page
  order; editor syntax colours follow the chrome's scheme.
- The read view swaps stylesheets with the kit's `swapStylesheet` and
  releases charts with `disposeEnhancement`; the IIFE captures only its own
  bundle as the engine (`captureEngineSource(undefined, { bundle })`).

### Safety and agents (closed loop, round 2)

- **`extract` no longer loses edits of `x.md`**: it replaces a different
  `x.md` only when it is a known state (unchanged since the CLI last wrote or
  read the pair, or a committed/staged/recent version in git) — whichever
  file is newer; otherwise it refuses with `extract x.md.html -o
  x.browser.md` (merge). `--force` keeps `x.md~`.
- **One file, one line of work**: the CLI records which text last synced each
  file (its last writer); a pair's record (and, for the twin, git) says "only
  the file changed" only while that pair is the file's last writer — so when
  two texts publish to one `-o` path, neither is told to bring the other's
  text into itself. An output holding another document (another uid) is
  never advised into the input, and `extract`/`upgrade` never replace a text
  with another document's text without `--force`. Every `next` is safe to
  follow verbatim (no text is lost).
- **Compare-and-swap**: `inspect` (`sha256`, `twin.sha256`), `extract` and
  `assemble` (`sha256`) report the SHA-256 of the text a file holds;
  `assemble --replaces <sha256>` / `extract --replaces <sha256>` replace only
  that exact text — for agents in fresh sandboxes without a cache. Known
  states also include the twin's 20 most recent commits (`git log`, bounded
  in time): a fresh clone works.
- `assemble` refuses to replace a file of a newer shell (as `upgrade` does)
  unless `--force`; `upgrade` refuses a file cut off inside its text unless
  `--force`; `new --force` keeps both replaced files as `<file>~`.
- **Machine-readable refusals**: every `--json` failure has a stable
  `reason` (`twin-differs`, `replaces-mismatch`, `legacy-file`,
  `newer-shell`, `unclosed-island`, `not-orz`, `exists`, `bad-usage`, …) and,
  where useful, `next: { command, args }`; `assemble --json` lists
  `unresolved` includes (`{ target, kind, reason }`), each warned once.
- A 0.x file next to a text: `assemble`, `upgrade` and `inspect` advise
  `upgrade x.md.html --text x.browser.md` and a merge (never `extract`).
  `inspect` advice names the files as given (no `<file>` placeholders).
- A cdn file's fallback line names the connection first.
- `mountEditor` takes FC-19 §3 `fileName`; the types add `Editor.ready` and
  `refreshPreview({ includes })`.

### Migration

- 0.x files are not opened as they are: `orz-mdhtml upgrade old.md.html`
  writes a format-1 file and its text twin, keeping the source exactly and
  moving `#orz-meta`, the saved theme and the `<title>` into the header;
  `orz-mdhtml inspect` says what any file is and what to do.
- Once 1.0.0 is published, a 0.9.x file's own "Framework 1.0.0 available"
  banner offers an update that cannot read a 1.0 release: it ends with
  "check your connection" and changes nothing. Use `orz-mdhtml upgrade`.
- Changing the theme or the measure (in the editor or the read view) now
  changes the document — they are header data — so the file is unsaved
  until Save.

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
