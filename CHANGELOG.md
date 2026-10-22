# Changelog

All notable changes to **orz-mdhtml** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed (CLI)

- A reader that stops early (`orz-mdhtml assemble x.md -o - | head -c 10`)
  no longer makes the CLI print a Node stack (EPIPE): it exits quietly
  (STATUS D-77).
- A command name orz-mdhtml does not have (`orz-mdhtml templates --help`,
  `help templates`) is a usage error that lists the commands — for
  `templates`, it points to `orz-mdhtml themes` — instead of being read as a
  file name and answered with the `assemble` help (D-105). A bare word that
  is a file is still assembled.
- The `--help` synopses name `[--cdn | --inline]` (`new`, `assemble`) and
  `--measure normal|wide|full` (D-107). `themes --json` keeps the family's
  `name` key (D-106; checked).
- `inspect` of another kind's file (an orz-slides or orz-paged document) names
  that file's own shell (`shell orz-slides 1.0.0 (another kind: use
  orz-slides)`, not `orz-mdhtml 1.0.0 (unknown)`) and advises its tool's
  command (`npx orz-slides inspect talk.slides.html`); `--json` adds
  `shell.tool` and `reason: "other-kind"` (D-78).

### Release tooling

- Publishing no longer re-runs the suite: `npm run test:release` runs it once
  on the release commit and writes a green-run stamp (`.release/green.json`,
  git-ignored); both `prepublishOnly`s run the family release gate
  (`scripts/release-check.ts`, shared by every orz package, facts in
  `release.config.json`: lockstep, dated entry, the kit installed from the
  registry and bundled, clean tree, release manifest) and the stamp check, in
  seconds. New scripts `release:check`, `test:fast`, `test:changed`,
  `test:release`; the real-Chrome files are a vitest project of their own
  (`chrome`). Development tooling only; nothing shipped changes.
- A file that fails in the stamp run is re-run alone with only its failed
  tests (`vitest -t` on their exact names; up to 2 tries); a suite-level
  failure (a hook, the file itself, a failed suite no failed test explains)
  re-runs the whole file. The stamp records which, per try.

<a id="102"></a>

## [1.0.2] — 2026-10-19

A fix release; released together with `orz-mdhtml-browser` 1.0.2. Still on
`orz-markdown ^2.3.0` (it bundles 2.3.0). No API, CLI or file-format change.

### Fixed

- **A file made by the Node CLI or library now passes
  [verify](https://markdown.orz.how/verify.html) when a newer orz-markdown is
  installed.** 1.0.1 wrote the theme stylesheet URL with the version of the
  orz-markdown the installation resolved (`^2.3.0` now resolves to 2.4.0:
  `orz-markdown@2.4.0/themes/…`), while its browser engine, built on 2.3.0,
  writes `@2.3.0` — so `npx orz-mdhtml` files differed from
  `OrzCarrier.assemble`'s by those bytes. The kit version is now fixed at
  build time (`src/version.ts`, `ORZ_MARKDOWN_VERSION`): Node and the
  browser write the same bytes whatever orz-markdown is installed (claim
  A.9; a new test runs the packaged library with a newer kit and compares
  with the bundle in Chrome). `ORZ_MARKDOWN_VERSION` and `--version` name
  the bundled kit.

### Documentation

- README: the header keys and the themes table (id and name), `--measure
  normal|wide|full`, a "Keys" section, inline is not offline, the 0.x
  migration notes that the default delivery became inline, `inspect`'s
  `twin: null`, what `other-kind` means, twin-link rewriting.
- The skill: a "Common mistakes" box (`{{mermaid}}` and friends are
  directives, not ```` ``` ```` fences; header-less Markdown), what to do
  with Markdown that has no header (`new` without a file prints one),
  readability advice (measure, long equations, Mermaid direction),
  `--no-includes`, `--no-text`, the include reasons, keys, corrected
  `inspect` wording.
- `orz-mdhtml-browser` README: the bundled kit version (2.3.0), the full ES
  module export list, a "Browsers, delivery and limits" section.
  `docs/embedding.md`: the CSP recipe is one copy-pasteable policy (tested
  in Chrome), the Mermaid `style-src-elem` note corrected (no nonce), hash
  policies explained.
- Surface round 2: `assemble` of an `x.md` whose header says `carrier:
  slides` prints no warning (only `inspect` shows `carrier-mismatch`); the
  0.x `<title>` moves into the header only when the text has no heading;
  which commands print the `sha256`; the embedding guide's policy gains
  `frame-src https://www.youtube.com` (as orz-slides' and orz-paged's), says
  how it differs from the example's, that the bridge hash differs between
  kit versions, and that Mermaid is unreadable (not unstyled) without
  `style-src-elem`. `homepage` in both package.json files is
  markdown.orz.how/mdhtml.html.

<a id="101"></a>

## [1.0.1] — 2026-10-12

A rebuild on the published `orz-markdown` 2.3.0 (`^2.3.0`); released together
with `orz-mdhtml-browser` 1.0.1. No API, CLI or file-format change.

### Security

- **The editor's preview bridge** (orz-markdown 2.3.0, FC-19 §8.4): a script
  in the previewed document can no longer take the bridge's private port
  (overridden built-ins, `fn.caller`, `window.event`) to forge the reader's
  keys or links; `__orzPreview` is frozen. Apps with a hash-based CSP use the
  kit's new `PREVIEW_BRIDGE_HASH` (this package hard-codes none).

### Changed

- **`light-playful-1` is a ruled notebook on screen**, in the read view and in
  the editor's preview: the kit's baseline grid runs by default
  (`enhanceDocument`, the preview frame); other themes are untouched; print is
  unchanged (claim R.16, real Chrome).
- From the kit: Cmd/Ctrl+P in the editor's preview prints the page, not the
  preview frame (md has no Print action: in the read view the key stays the
  browser's); tab panes print under their labels and a `{{youtube}}` embed
  prints its address; the editor toolbar wraps in a narrow column; read-view
  list labels line up.

### Fixed

- A heading named "Mermaid" (`id="mermaid"`) no longer stops Mermaid diagrams
  from loading (the kit detects each content library by its API).

<a id="100"></a>

## [1.0.0] — 2026-10-09

A rebuild on the orz-markdown carrier kit (orz text format 1). Requires
`orz-markdown ^2.2.0`; released together with `orz-mdhtml-browser` 1.0.0.

### Breaking

- The 0.9 files, Node API and CLI shape are replaced. 0.x files are not
  opened as they are: `orz-mdhtml upgrade old.md.html` writes a format-1 file
  and its text twin (the source kept exactly; `#orz-meta`, the saved theme
  and the `<title>` move into the header). `orz-mdhtml inspect` says what any
  file is and what to do.
- Removed: `buildMdHtml`, `composeInlineMdHtml`, `findRendererBundle`,
  `findAsset`, `orzVersionOf`, `selfVersionOf`; the 0.x runtime
  (`assets/app.js`, `orzmd.browser.js`); `--theme` and `--title` on
  generation (content comes only from the text's header); `--cdn` as the
  default (files are inline by default).
- Theme and width (`measure`) are document data in the header: changing them
  in the page changes the document (unsaved until Save, undoable).

### The new file

- A document is its **text twin** `x.md` (Markdown with a `{{nyml kind:
  document}}` header: `carrier`, `uid`, `title`, `theme`, `measure`, `lang`
  and the DocMeta keys) and its **self-editing file** `x.md.html` =
  `assemble(text)`: the exact text (BOM and line endings kept) in the
  `#orz-src` island, an agent banner, `#orz-shell`, `#orz-meta` and head
  metadata from the header, `#orz-includes` (includes resolved at assembly)
  and a regenerable shell. Node and the browser write the same bytes.
- **Read view** in the page (no iframe) with the header's theme and measure;
  content libraries load only when the document needs them; a hanging CDN
  never holds the page blank. Reading is undisturbed: one **pencil** at the
  bottom-left (click: Edit; hover, tap or ArrowUp: Edit, Save, Download a
  copy, New document, Save as new copy, Theme, Width, Text size and the
  update). *Text size* (80–160 %) is the reader's, kept per `uid`, never in
  the file.
- **Editor** (the kit's editor shell): CodeMirror beside a live preview
  (split, editor, preview), header pickers, undo; its bar ends with the orz
  seal (markdown.orz.how) and the GitHub link. Cmd/Ctrl+S / E / Z; a warning
  before closing with unsaved changes.
- **Save, New document, Save as new copy**, Download a copy: every save
  writes `assemble(text)`, never the live DOM. Save in place in Chromium;
  elsewhere a download.
- **The save-conflict question**: a save never silently overwrites a file
  that changed on disk since the page opened it (another program, an agent,
  an `assemble`); the reader chooses *Replace it* or *Download a copy
  instead*.
- **Quiet update**: a local file checks at most once a day for a newer
  `orz-mdhtml-browser` (`release.json`, SHA-384-verified bundle) and offers
  *Update now*, which re-assembles the same text; nothing changes until the
  reader asks.
- **Hosts**: `orz-host-save@1`, `orz-host-ai@1` (an AI menu with a review
  panel) and `orz-host-include@1`; canonical spec in orz-markdown
  `spec/host-protocols.md` (PROTOCOL.md is now a pointer).

### CLI

- Commands `new`, `assemble` (also `orz-mdhtml x.md`), `extract`, `upgrade`,
  `inspect`, `themes`. Inline by default (the engine inside the file, about
  1 MB); `--cdn` writes a small file that loads
  `orz-mdhtml-browser@<version>` from jsDelivr.
- `--json` on every command (one object on stdout); exit 0 done, 1 refused
  or failed, 2 usage. Every failure carries a stable `reason` code
  (`twin-differs`, `output-differs`, `replaces-mismatch`, `legacy-file`,
  `newer-shell`, `unclosed-island`, `not-orz`, `exists`, `bad-usage`, …) and,
  where one command resolves it, `next: { command, args }` built from the
  caller's own arguments and safe to run verbatim.
- Nothing that could hold other work is overwritten without `--force`:
  `assemble` refuses a `.md.html` holding a different text (browser work),
  `extract` an `x.md` holding edits, whichever file is newer; another
  document (another `uid`) is never replaced. **Known earlier states** are
  replaced without `--force`: what the CLI last wrote or read for the pair
  (recorded by hash in `$XDG_CACHE_HOME/orz-mdhtml/`), the twin's git HEAD,
  staged version or one of its 20 most recent commits. **`--replaces
  <sha256>`** (every command prints the `sha256` of the text) is a portable
  compare-and-swap for agents in fresh sandboxes.
- **Backups**: `--force` keeps the replaced file as `<file>~` (`~1`, `~2`, …;
  a backup is never overwritten). Files are written through a temporary file
  and a rename, keeping their mode and symbolic links.
- `assemble` keeps the existing file's delivery and includes;
  `--resolve-includes` reads file includes from the text's folder; unresolved
  and stale includes are reported. `upgrade` and `assemble` never downgrade a
  newer shell without `--force`. `inspect` reports kind, format, shell
  version, delivery, uid, header, lint, the file's structure, the sibling
  twin and advice naming your files.

### Library

- `assemble`, `extract`, `readDocument`, `newDocument`, `inspect`, `upgrade`,
  `readLegacy`, `THEMES`, `DEFAULT_THEME`, `isThemeId`, `MEASURES`,
  `DEFAULT_MEASURE`, `VERSION`, `ORZ_MARKDOWN_VERSION`, `FORMATS`,
  `BUNDLE_FILE`, `cdnBundleUrl`, `engineSource`, `engineFiles`; types
  included. `assemble(text, { includes, delivery })`.

### orz-mdhtml-browser

- `orz-mdhtml.browser.js` (IIFE): sets `globalThis.OrzCarrier` (FC-19:
  `assemble`, `extract`, `readDocument`, `mountEditor`, `renderPreview`,
  `standalone`) and boots an assembled file. `esm/orz-mdhtml.browser.mjs`: the
  same API as ES module exports, no global, no boot. `release.json` (version,
  formats, notes, SHA-384 of the bundle), `index.d.ts`, a `require` shim that
  throws a clear error. Pure-ASCII bundles obeying the bundle rule; a
  `prepublishOnly` check of `release.json` against the files.

### Web apps

- `mountEditor(element, { text, hooks, nonce, includes, fileName })`: any
  number of editors per page, the app's own hooks (save, AI with a review
  step, includes, assets, links, ids), a nonce Content-Security-Policy.
  Guide: `docs/embedding.md` (shipped in both packages); working example:
  `examples/webapp/`.

### Agents

- Every file carries an agent banner (where the text is, how to unescape
  it, the skill link). The skill `orz-mdhtml-skills/SKILL.md` gives the
  create / compare / edit-the-twin / assemble / extract / inspect / upgrade /
  recover-by-hand procedures and the `reason` codes.

### Accepted limits

- A `.md.html` is a program: open files only from trusted sources; content
  that is deliberately hostile is out of scope, and a file cannot prove its
  own integrity.
- Save in place needs Chromium (File System Access); elsewhere Save
  downloads. A served (http) page is never saved in place.
- Theme, KaTeX and highlight.js styles, content libraries and the editor load
  from CDNs, also in an inline file.
- The CLI fetches no URL includes; a file shows only the includes it records.
- A shallow clone knows only the twin's last commit (use `--replaces`); a
  text equal to one of the twin's last 20 commits counts as a known state.
- A 0.9.x file's own "Framework 1.0.0 available" banner cannot read a 1.0
  release: it ends with "check your connection" and changes nothing. Use
  `orz-mdhtml upgrade`.

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
