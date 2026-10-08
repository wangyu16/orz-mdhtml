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
read the error, do not reach for `--force` by reflex.

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

1. **Compare before you edit.** If you only have `x.md.html`:
   `npx orz-mdhtml extract x.md.html` → `x.md` (exact, byte for byte). If you
   have both: `npx orz-mdhtml inspect x.md --json` and read `twin`:
   - `holds: "same"` → go on;
   - `holds: "different"` → `x.md.html` holds other (browser) edits: run
     `npx orz-mdhtml extract x.md.html -o x.browser.md`, merge its changes
     into `x.md` (or ask the user which to keep), then go on.
2. Edit `x.md`. Document settings go in the header, not in the HTML and not
   as CLI options (`assemble` refuses `--title`, `--theme`…).
3. `npx orz-mdhtml assemble x.md` → `x.md.html`. No `--force` is needed
   when `x.md.html` holds an earlier state of `x.md` the CLI can prove: what
   `orz-mdhtml` itself last wrote into it or read out of it (after `extract`,
   `new --html` or a previous `assemble`), or `x.md`'s last commit / staged
   version in git. So: **`extract` first, then edit, then `assemble`** — it
   just works. It refuses when the file holds any other text — someone saved
   in the browser in between: do step 1 (extract to another name, merge),
   then assemble again. Only when `x.md` has everything,
   `npx orz-mdhtml assemble x.md --force` (the replaced file is kept as
   `x.md.html~`). `--json` reports `replaced: "cache" | "git-head" |
   "git-index" | null`.

Includes: `assemble` keeps the includes the old file recorded;
`assemble --resolve-includes` reads `{{md part.md}}` files from the text's
folder (never outside it). Includes left unresolved are reported as
`warnings` — the file shows nothing there.

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
`checks` (a file's structure), `twin` (the sibling `x.md` ↔ `x.md.html`:
same text or not, which is newer), and **follow `advice`** — it names the
command to run:

- `legacy` (an orz-mdhtml 0.x file) → `upgrade` (its own "Framework 1.0.0
  available" banner cannot update it: that ends with "check your
  connection" and changes nothing);
- `twin.holds: "different"` → the text and the file differ: extract and
  merge before assembling (see "Edit an existing document") — unless
  `twin.earlier` is set (`cache`, `git-head`, `git-index`): the file holds an
  earlier text of `x.md`, and `assemble` replaces it without `--force`;
- `checks.island: "unclosed"` → the file was cut off: the text may be
  incomplete — find a backup; `checks.engine: "different"` / `"missing"` or
  `checks.end: "unclosed"` → `upgrade` re-assembles it (the text is intact);
- an older shell → `upgrade` re-assembles it (text unchanged);
- a newer shell or a newer text `format` → use `npx orz-mdhtml@latest`; do not
  re-assemble with an older tool (`upgrade` refuses to downgrade);
- lint errors → fix the header, then assemble;
- another kind (`slides`, `paged`) → its own tool (`npx orz-slides`, …).

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
downgrades). Upgrading twice changes nothing more. Once orz-mdhtml 1.0.0 is
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
copy*; if the file changed on disk since the page opened it (you ran
`assemble --force` while it was open), the save asks the reader — *Replace
it* or *Download a copy instead* — instead of overwriting your work; *New document* and *Save as new copy* (new `uid`) under More; a quiet,
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
- `--force` keeps what it replaces as `<file>~`; still, compare before you
  force (see "Edit an existing document"). The pair records live in
  `$XDG_CACHE_HOME/orz-mdhtml/` (else `~/.cache/orz-mdhtml/`); deleting them
  only makes `assemble` stricter.
- Keep the `uid` across revisions of a document. A different document needs
  its own: start it with `new` (or the file's *Save as new copy*), never by
  copying another text's header with its `uid`.
- Package: `orz-mdhtml` depends on `orz-markdown ^2.2.0` (the carrier kit);
  files record the shell version that wrote them.
- Security: a `.md.html` runs the code inside it — treat files like programs
  and open only trusted ones.
