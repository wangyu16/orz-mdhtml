# Changelog

All notable changes to **orz-mdhtml** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

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
