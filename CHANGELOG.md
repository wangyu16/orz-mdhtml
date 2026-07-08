# Changelog

All notable changes to **orz-mdhtml** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

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
