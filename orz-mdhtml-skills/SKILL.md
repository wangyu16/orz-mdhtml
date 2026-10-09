---
name: orz-mdhtml
description: Create, edit, inspect and upgrade orz-mdhtml documents — a Markdown text twin (x.md, orz text format 1, with a {{nyml kind document}} header) and its single-file, self-editing x.md.html that reads like a themed web page and edits and saves itself in the browser. Use when a user wants a shareable HTML document they can edit without an app (handouts, notes, articles), when you meet a .md.html file and need its text, when a .md.html must be changed, checked or moved to a newer version, or when a web app should embed the editor. Edit the text, never the HTML; assemble with the orz-mdhtml CLI.
---

# orz-mdhtml — Markdown that edits itself

A document has two forms:

- the **text twin** `x.md` — the document itself: Markdown (orz-markdown
  syntax) with a header block at the top;
- the **self-editing file** `x.md.html` = `assemble(text)` — one HTML page
  holding the exact text in a `#orz-src` island plus a regenerable shell (read
  view, editor, saves, quiet update).

**Rule: change the text, then assemble. Never edit, restructure or
"fix" the HTML** — everything but the island is regenerated, and a save in the
browser rewrites the whole file from the text.

The CLI is `orz-mdhtml` (Node ≥ 20.16; `npx orz-mdhtml …` needs no install).
Use `--json` on any command for one machine-readable object on stdout. Exit
codes: 0 done, 1 refused or failed, 2 usage error. Nothing that could hold
other work is overwritten unless you pass `--force` — when a command refuses,
read the error (with `--json`: `reason` and `next`, below), do not reach for
`--force` by reflex.

**The one robust idiom:** pass the `sha256` the last command printed as
`--replaces`. `assemble`, `extract`, `upgrade` and `inspect` print the
SHA-256 of the text they wrote or read (`--json`: `sha256`; `inspect`:
`twin.sha256` for the sibling); `assemble x.md --replaces <that sha256>`
replaces the file only while it still holds that text. It works with no
cache, no git, in a shallow clone, in a fresh sandbox.

## Create a document

```bash
npx orz-mdhtml new notes.md --title "Field notes" [--theme light-academic-1] [--measure wide] [--lang en]
# edit notes.md (the body; header keys below)
npx orz-mdhtml assemble notes.md          # → notes.md.html (inline engine, ~1 MB, works as a file)
npx orz-mdhtml assemble notes.md --cdn    # → a small file that loads the engine from jsDelivr (for web pages)
```

`new` mints the document's `uid`; keep it (it keys the reader's preferences
and the save handle). `new --html` writes both files at once. `orz-mdhtml
notes.md` is short for `assemble`. Theme ids: `orz-mdhtml themes`.

## Edit an existing document

The `.md.html` can be edited and saved in a browser, so it may hold work the
text twin lacks — even when `x.md` is the newer file. Always compare first.

1. **Compare before you edit.** `npx orz-mdhtml inspect x.md --json`
   (works with only `x.md.html` too) and read `sha256` and `twin`:
   - no `x.md` yet → `npx orz-mdhtml extract x.md.html` (exact, byte for byte);
   - `twin.holds: "same"` → go on;
   - `twin.holds: "different"` with `twin.earlier` set → the file holds an
     earlier text of `x.md`; go on (assemble replaces it);
   - `twin.holds: "different"` otherwise → `x.md.html` holds other (browser)
     edits: `npx orz-mdhtml extract x.md.html -o x.browser.md`, merge its
     changes into `x.md` (or ask the user which to keep), and **note
     `twin.sha256`** (the text the file holds now);
   - if `x.md` itself has nothing of its own to keep (the file is the newer
     work), `npx orz-mdhtml extract x.md.html` replaces it when it is a known
     state (unchanged since the CLI last synced the pair — and no other
     text was synced with the file since — or committed in git), or `extract x.md.html --replaces <sha256 of x.md>`. A plain
     `extract` never overwrites an `x.md` that may hold edits.
2. Edit `x.md`. Document settings go in the header, not in the HTML and not
   as CLI options (`assemble` refuses `--title`, `--theme`…).
3. `npx orz-mdhtml assemble x.md` → `x.md.html`. No `--force` is needed
   when `x.md.html` holds an earlier state of `x.md` the CLI can prove: what
   `orz-mdhtml` itself last wrote into it or read out of it (after `extract`,
   `new --html` or a previous `assemble`, for the same pair — with `-o` too:
   `assemble x.md -o public/x.md.html --cdn` again and again needs nothing),
   or (for `x.md.html` itself) a committed version of `x.md` in git (HEAD,
   staged, or one of its 20 most recent commits — a full clone works; a
   shallow checkout, CI's default `--depth 1`, knows only the last commit:
   use `--replaces <sha256>` there). A text equal to one of the twin's last
   20 commits counts as a known earlier state, so a deliberate revert of
   the other file to such a text is replaced — commit the revert first.
   **In a fresh sandbox with no cache and no history, use the token:**
   `npx orz-mdhtml assemble x.md --replaces <twin.sha256>` replaces the file
   only while it still holds the text you saw (a compare-and-swap);
   a browser save made since is refused (`replaces-mismatch`). If assemble
   refuses (`twin-differs`), someone saved in the browser: do step 1 (extract
   to `x.browser.md`, merge), then run the assemble command the refusal
   names (your own arguments plus `--replaces` and the hash). If only the
   file changed (`x.md` is exactly what the CLI last synced), `next` is a
   plain `extract x.md.html`: run it. A warning "pair not recorded (cache
   not writable)" means the next assemble needs `--replaces` with the hash
   just printed. Only when `x.md` has everything,
   `npx orz-mdhtml assemble x.md --force` (the replaced file is kept as
   `x.md.html~`, or `x.md.html~1`, `~2`… — a backup is never overwritten).
   `--json` reports `replaced: "cache" | "git-head" | "git-index" |
   "git-log" | "token" | null` and the `sha256` of the text the file now
   holds.

Delivery: `assemble` keeps the existing file's delivery (cdn stays cdn)
unless you pass `--cdn` or `--inline`; a new file is inline.

Includes: `assemble` keeps the includes the old file recorded;
`assemble --resolve-includes` reads `{{md part.md}}` files from the text's
folder (never outside it). Each include left unresolved is reported once as
a warning, with why, and in `--json` `unresolved: [{ target, kind, reason }]`
— the file shows an "Included file not available" note there. A recorded
include whose file has changed since is a `stale-record` warning (`--json`
`stale`): run `assemble --resolve-includes` to record the current text.

Content syntax (math, `{{mermaid}}`, `{{smiles}}`, `{{chart}}`, `::: ` containers,
`{{md path}}` includes, …) is orz-markdown's: read its skill,
`node_modules/orz-markdown/orz-markdown-skills/SKILL.md` or
`https://cdn.jsdelivr.net/npm/orz-markdown/orz-markdown-skills/SKILL.md`.
A relative link to another text twin (`[next](week2.md)`) becomes a link to
its `.md.html` in the file.

## The document header (FC-18)

```markdown
{{nyml
kind: document
carrier: md
uid: doc-7kq2m9x4p1r8s3t5
title: Cell Biology — Week 3
author: Yu Wang
lang: en
theme: light-academic-1
measure: wide
license: CC-BY-4.0
}}

# Cell Biology — Week 3
```

- `{{nyml` alone on the first line, `kind: document` on the next, `}}` alone
  on the last. It renders nothing.
- Keys (md): `carrier` (`md`), `uid` (`doc-` + 10–32 of `[0-9a-z]`; do not
  invent or change one — `new` mints it), `title`, `author`, `description`,
  `date`, `keywords` (comma-separated), `source`, `license` /
  `license_name` / `license_url`, `lang` (BCP 47, default `en`), `theme` (an
  id from `orz-mdhtml themes`, default `light-neat-3`), `measure` (`normal`,
  `wide`, `full`; default `normal`), `format` (only `1`; omit it).
- Your own tool's keys: prefix `x_<tool>_`. Unknown keys are kept.
- One `key: value` per line; `key: |` then more-indented lines for a
  multi-line value. A value must not contain `}}`. Edit the header in place —
  change one line, never rewrite or reorder the block.
- No `title`? The file's title is the first heading.
- An old `{{nyml kind: meta}}` block is read as the header and becomes
  `kind: document` on the first edit.

## Inspect before you act

```bash
npx orz-mdhtml inspect x.md.html --json    # also works on a text, a 0.x file, any HTML
```

Read `input` (`text`, `assembled`, `legacy`, `html`), `kind`, `format`,
`writable`, `shell.version` and `shell.relation` (`older` / `same` /
`newer` than this tool), `uid`, `title`, `header.keys`, `includes`, `lint`,
`checks` (a file's structure), `sha256` (of the text it holds: the
`--replaces` token), `twin` (the sibling `x.md` ↔ `x.md.html`: `holds`
`same` / `different` / `none`; `newer` — which was modified last: `input`
the inspected file, `twin` its sibling, `same-time`, `unknown`; `sha256` of
the sibling's text; `earlier` when known), and **follow `advice`** — it
names the command to run, with your file names:

- `legacy` (an orz-mdhtml 0.x file) → `upgrade` (its own "Framework 1.0.0
  available" banner cannot update it: that ends with "check your
  connection" and changes nothing). **Next to an existing `x.md`** (often a
  0.x text): `upgrade x.md.html --text x.browser.md`, then compare and merge
  into `x.md` (keep the new header) — `extract` does not read 0.x files;
- `twin.holds: "different"` → the text and the file differ: extract and
  merge before assembling (see "Edit an existing document") — unless
  `twin.earlier` is set (`cache`, `git-head`, `git-index`, `git-log`): the
  file holds an earlier text of `x.md`, and `assemble` replaces it without
  `--force`;
- `checks.island: "unclosed"` → the file was cut off: the text may be
  incomplete — recover what you can (`extract x.md.html -o
  x.recovered.md`), compare with the twin or a backup; `upgrade` refuses it
  unless `--force`. `checks.engine: "different"` / `"missing"` or
  `checks.end: "unclosed"` → `upgrade` re-assembles it (the text is intact);
- an older shell → `upgrade` re-assembles it (text unchanged);
- a newer shell (`shell.relation: "newer"`) or a newer text `format` → use
  `npx orz-mdhtml@latest`; this tool's `assemble` and `upgrade` refuse to
  replace a newer shell (`newer-shell`) unless `--force` — do not force it;
- lint errors → fix the header, then assemble;
- another kind (`slides`, `paged`) → its own tool (`npx orz-slides`, …).

## When a command refuses (`--json`)

A failure is `{ "ok": false, "error", "reason", "next"?, "exitCode" }`.
`next` is `{ "command", "args" }`: run `npx orz-mdhtml <command> <args…>`
(e.g. `extract x.md.html -o x.browser.md`), then merge as above. Stable
`reason` codes:

- `twin-differs` — the twin holds a different text that is not a known
  state (assemble: `x.md.html` may hold browser work; extract/upgrade:
  `x.md` may hold edits) → extract to `x.browser.md`, merge, assemble with
  `--replaces`;
- `replaces-mismatch` — the file no longer holds the text whose hash you
  passed (a save happened since) → extract again and merge;
- `legacy-file` — a 0.x file → `upgrade` (next to a text: `--text
  x.browser.md`), merge, then `assemble x.md --replaces` with the `sha256`
  upgrade printed (not `--force`);
- `newer-shell` / `newer-format` → `npx orz-mdhtml@latest`;
- `unclosed-island` — upgrade of a cut-off file → recover with
  `extract -o x.recovered.md`;
- `output-differs` — the `-o` output holds **another text** than the one
  this pair last had there (saved in the browser, or written from another
  text) → follow `next` (`extract <out> -o x.browser.md`), merge, then the
  assemble command the message names (with `--replaces`); or it holds
  **another document** (another uid; no `next`) → choose another `-o` path
  (`extract`/`upgrade` refuse the same way to write another document's text
  over a text). Every `next` is safe to run verbatim: it never replaces a
  text with another line of work. A plain `extract x.md.html` (the file
  replaces `x.md`) is suggested only when `x.md` is unchanged since the CLI
  last synced it (or committed) AND both texts carry the same `uid`; without
  a shared uid the file may be another document's (copied over it), so
  `next` is `extract x.md.html -o x.browser.md` — keep the `uid` `new` wrote;
- `not-orz`, `exists` — an output you did not expect to replace (an empty
  file is reported as empty: damaged) → choose another path;
- `assembled-input`, `other-kind`, `invalid-text`, `no-such-file`,
  `unreadable`, `not-utf8`, `write-failed`, `engine-unavailable`,
  `bad-usage` (exit 2), `failed`.

## Upgrade old files

```bash
npx orz-mdhtml upgrade old.md.html            # in place, and writes old.md (its text twin)
npx orz-mdhtml upgrade old.md.html -o new.md.html --text new.md
```

A 0.x file (orz-mdhtml ≤ 0.9.3) keeps its source exactly; its `#orz-meta`
metadata, saved theme and `<title>` move into the header, and it gets a `uid`.
The delivery (inline or cdn) is kept unless `--cdn` / `--inline`. A format-1
file of an older shell is re-assembled with its text and includes unchanged
(this also repairs a damaged engine). A file of a newer shell is refused (no
downgrades), and so is a file cut off inside its text (the text may be
incomplete) — `--force` overrides either and keeps the old file as `x.md.html~`.
If `x.md` already exists and differs (a 0.x text next to its 0.x file),
`upgrade` refuses to overwrite it: `upgrade x.md.html --text x.browser.md`,
then merge. Upgrading twice changes nothing more. Once orz-mdhtml 1.0.0 is
published, a 0.9.x file's own "Framework 1.0.0 available" banner offers an
update that fails harmlessly ("check your connection"): use
`orz-mdhtml upgrade`.

## Recover the text from any version by hand

When the CLI is not available, read the `<script type="text/markdown"
id="orz-src">` element's raw content (`textContent`, or the bytes between the
tags) and undo its escaping:

- **Format 1** (`<script id="orz-shell">` exists, `data-orz-format="1"` on the
  island): remove **one** backslash after each `<` that is followed by
  backslashes and then `script` or `/script` (any case); turn the line breaks
  into the style named by `data-orz-eol` (`lf`, `crlf`, `cr`); prefix U+FEFF
  when `data-orz-bom` is present. That is the exact text, header included.
  In code: `extract(html).text` from `orz-markdown/carrier` (or
  `orz-mdhtml`'s `extract`). `#orz-includes` (JSON) holds includes resolved
  at assembly; `#orz-meta` and `<head>` are derived from the header.
- **0.x** (no `#orz-shell`; `<meta name="generator" content="orz-mdhtml">`):
  replace each `<\/script` (any case) with `</script`; remove the one line
  break the writer added at the start and the one at the end (the island is
  `"\n" + source + "\n"`). Metadata is **not** in the island: it is the JSON
  of `<script id="orz-meta">` (title, author, license, …); the reader's saved
  theme is `data-theme` on `<html>`. Prefer `orz-mdhtml upgrade`, which does
  all of this and writes a header.

## In a web app

The same editor is a component: `npm install orz-mdhtml-browser`, then
`mountEditor(element, { text, hooks: { save, ai, fetchInclude, … }, nonce })`
(ES module, or `globalThis.OrzCarrier` from the IIFE). Store the text; call
`assemble(text)` only when a file is needed. Hooks, the AI review flow and the
CSP recipe: `docs/embedding.md`, shipped in both packages
(`node_modules/orz-mdhtml-browser/docs/embedding.md`, or
`https://cdn.jsdelivr.net/npm/orz-mdhtml-browser/docs/embedding.md`).
Platforms that show assembled files in an iframe use the host protocols
(orz-markdown `spec/host-protocols.md`).

## What the file does for its reader

Read view with the header's theme; **Edit** (Cmd/Ctrl+E): editor + live
preview, theme and measure pickers that write the header; **Save**
(Cmd/Ctrl+S) writes `assemble(text)` back in place in Chromium (File System
Access) and downloads elsewhere; a served (http) page offers *Download a
copy*; whenever the file changed on disk since the page opened it (any
`assemble` you ran while it was open, not only `--force`), the save asks
the reader — *Replace it* or *Download a copy instead* — instead of
overwriting your work; *New document* and *Save as new copy* (new `uid`) under More; a quiet,
once-a-day update offer on local files. Reading and editing work in every
modern browser; themes, math styles, diagram libraries and the editor load
from CDNs.

## Gotchas

- Do not edit `x.md.html` by hand, and never serialize a live page: the text
  is the document.
- A file shows only includes stored in its `#orz-includes`. The CLI keeps
  the old file's record and resolves file includes with
  `assemble --resolve-includes` (from the text's folder only); it never
  fetches URL includes (library callers pass `assemble(text, { includes })`;
  `upgrade` keeps a file's own). Unresolved includes are warnings.
- `--force` keeps what it replaces as `<file>~` (or `<file>~1`, `~2`…;
  also `new --force`, for both files); still, compare before you force (see "Edit an existing
  document"). The pair records live in `$XDG_CACHE_HOME/orz-mdhtml/` (else
  `~/.cache/orz-mdhtml/`); deleting them only makes `assemble` and `extract`
  stricter — `--replaces <sha256>` works without them.
- Keep the `uid` across revisions of a document. A different document needs
  its own: start it with `new` (or the file's *Save as new copy*), never by
  copying another text's header with its `uid`.
- Package: `orz-mdhtml` depends on `orz-markdown ^2.2.0` (the carrier kit);
  files record the shell version that wrote them.
- Security: a `.md.html` runs the code inside it — treat files like programs
  and open only trusted ones.
