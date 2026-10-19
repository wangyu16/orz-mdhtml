# Host protocols — orz-mdhtml

The host protocols `orz-host-save@1`, `orz-host-ai@1` and
`orz-host-include@1` are specified once for the whole orz family in
orz-markdown:
**[`spec/host-protocols.md`](https://github.com/wangyu16/orz-markdown/blob/main/spec/host-protocols.md)**
(also in the installed package from orz-markdown 2.4.0: `node_modules/orz-markdown/spec/host-protocols.md`).
That document is canonical — messages, handshake, security rules on both
sides, format-1 saves, versioning. This file used to hold the spec; it now
lists only what is particular to orz-mdhtml. A host implements the protocols
with orz-markdown's `embedCarrierFrame` (`orz-markdown/carrier/shell`); the
file side is built into every `.md.html`.

## What an orz-mdhtml file does (1.0, text format 1)

- **Kind** `md` in every `ready` (spec §2).
- **All three protocols** are answered, and only in a frame
  (`window.parent !== window`) after the host's hello (spec §6).
- **Save** (`orz-host-save@1`, spec §3, §7): `source` is the exact text twin
  and `html` is `assemble(source)` with the file's delivery and its
  `#orz-includes` record — the same bytes a file save would write. Saves from
  the read view (a header setting) and from the editor both go to the host;
  the dirty state is posted. A hosted file never shows a file picker and
  never checks for updates. `theme` may be omitted: the text's header holds it.
  Persist the text; the HTML can always be regenerated.
- **AI** (`orz-host-ai@1`, spec §4): the host's operations appear as an **AI**
  menu in every editor of the file. A result is shown in a review panel (the
  proposal is editable); the document changes only when the reader applies it,
  as one undoable edit, and only if the text did not change meanwhile.
- **Include** (`orz-host-include@1`, spec §5): the read view and the editor
  preview ask the host for URL includes (`{{md https://…}}`,
  `{{markdown …}}`, `{{md-include …}}`); the host's answer wins, and the
  file's `#orz-includes` record (resolved at assembly) is the fallback. The
  text keeps the directive. A standalone file never fetches an include URL.

## Older files

orz-mdhtml 0.x files (before text format 1) speak version 1 of the same
protocols (`orz-host-include@1` from 0.9.0): their `source` is the Markdown of
the 0.x island (no format-1 header) and `theme` is the reader's theme choice.
Upgrade them with `orz-mdhtml upgrade` (README, "Migrating from 0.x").
