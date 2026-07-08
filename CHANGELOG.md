# Changelog

All notable changes to **orz-mdhtml** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

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
