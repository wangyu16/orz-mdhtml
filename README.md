# orz-mdhtml

**Markdown that edits itself.**

A document is its **text twin** — `notes.md`, plain Markdown with a small
header — and its **self-editing file** `notes.md.html`, one HTML page that
reads like a themed website, edits itself in the browser and saves back in
place. The file is always `assemble(text)`: the text inside it is the
document; everything else is a shell that can be regenerated. Built on the
carrier kit of [orz-markdown](https://www.npmjs.com/package/orz-markdown)
(`^2.3.0`; this release bundles 2.3.0; orz text format 1).

## What a 1.0 `.md.html` is

- **The text twin inside.** The exact text (BOM and line endings kept) rides
  in the file's `<script type="text/markdown" id="orz-src">` island.
  `orz-mdhtml extract` gives it back byte for byte; an agent banner at the top
  of `<body>` tells tools how to read it.
- **A read view, undisturbed.** The document is rendered in the page with the
  theme and line length its header names (`theme`, `measure`); math, code
  highlighting, diagrams, chemistry and charts are drawn once their libraries
  arrive, and copying rendered content copies Markdown. The page shows one
  control: a small pencil at the bottom-left. Click it to edit; hover it (tap
  it on a touch screen, or Tab to it and press ArrowUp) for the list of
  everything else — Edit, Save, Download a copy, New document, Save as new
  copy, Theme, Width, Text size and, when there is one, the update. A dot on
  the pencil means unsaved changes.
- **Text size.** *Text size* (A− 100% A+) makes the reading text smaller or
  larger, 80–160 %. It is your preference, not the document's: kept in this
  browser for this document (by its `uid`), never saved into the file, and it
  does not mark the document unsaved. The editor's preview keeps the
  document's own size.
- **Edit.** The pencil (or Cmd/Ctrl+E) opens the editor: CodeMirror beside a
  live preview (split, editor or preview mode), theme and width pickers that
  edit the header, undo per document. **Done** goes back to the read view;
  **More** has *Download a copy*, *New document* and *Save as new copy*. The
  editor's bar ends, quietly, with the orz seal (the orz-markdown website,
  https://markdown.orz.how) and a link to this tool's GitHub repository. The
  theme and the width are document data (they live in the header), so
  choosing one — in the editor or from the read view — changes the document:
  it is unsaved until you Save, and Cmd/Ctrl+Z undoes it. The split view
  scrolls the preview along with the text.
- **Save, New, Copy.** **Save** (Cmd/Ctrl+S) writes `assemble(text)` — never
  the live page — back to the file. *Download a copy*, *New document* and
  *Save as new copy* (the same text with a new `uid`) are in the pencil's list
  and in the editor's More menu. The page asks before it closes with unsaved
  changes.
- **A quiet update.** A local file checks, at most once a day, whether a newer
  release of its engine exists; if so, the pencil gets a small dot and its
  list offers *Update to x.y.z* (in the editor, an "Update available" chip).
  *Update now* re-assembles the same text with the new release (its bundle
  verified by SHA-384) and saves it; nothing changes until the reader asks.
  Served pages, framed pages and pages with a host never check.

Content (title, theme, measure, language, author, licence…) comes only from the
text's header (`{{nyml` on the first line, `kind: document` on the next):

```markdown
{{nyml
kind: document
carrier: md
uid: doc-7kq2m9x4p1r8s3t5
title: Cell Biology — Week 3
author: Yu Wang
theme: light-academic-1
measure: wide
}}

# Cell Biology — Week 3
```

| Key | Value |
|---|---|
| `carrier` | `md` (written by `new`) |
| `uid` | the document's id, `doc-` + 10–32 of `[0-9a-z]`; `new` mints it — keep it, never invent or copy one |
| `title`, `author`, `description`, `date`, `keywords`, `source` | document metadata (`keywords` comma-separated); no `title`: the first heading |
| `license`, `license_name`, `license_url` | an SPDX id, or a name and a URL |
| `lang` | BCP 47 language of the content (default `en`) |
| `theme` | a theme id (below; default `light-neat-3`) |
| `measure` | line length: `normal` (default), `wide`, `full` |
| `format` | the text format, only `1` (omit it) |

Your own tool's keys take the prefix `x_<tool>_`; unknown keys are kept and
reported by `inspect` (lint). A Markdown file without a header still
assembles (title from its first heading, no `uid`); to give it one, run
`orz-mdhtml new --title "…"` with no file name — it prints a fresh header
and a starter body on stdout — and paste the `{{nyml` … `}}` block at the
top.

Themes (`orz-mdhtml themes`; the reader can switch theme, which edits the
header):

| id | Name | | id | Name |
|---|---|---|---|---|
| `light-neat-3` | Orchard (default) | | `light-playful-1` | Playful (a ruled notebook on screen) |
| `light-neat-1` | Neat | | `light-playful-2` | Playful 2 |
| `light-neat-2` | Neat 2 | | `dark-elegant-1` | Dark Elegant |
| `light-academic-1` | Academic | | `dark-elegant-2` | Dark Elegant 2 |
| `light-academic-2` | Academic 2 | | `dark-elegant-3` | Nocturne |
| `beige-decent-1` | Beige | | `beige-decent-2` | Beige 2 |

Examples: [`examples/metadata.md`](https://github.com/wangyu16/orz-mdhtml/blob/main/examples/metadata.md) and its inline
[`metadata.md.html`](https://github.com/wangyu16/orz-mdhtml/blob/main/examples/metadata.md.html) (metadata in the header),
[`examples/web-page.md`](https://github.com/wangyu16/orz-mdhtml/blob/main/examples/web-page.md) and its cdn
[`web-page.md.html`](https://github.com/wangyu16/orz-mdhtml/blob/main/examples/web-page.md.html) (a small file for the web).

## Install

Node 20.16 or newer. Run the CLI with `npx` (nothing to install) or install
it:

```bash
npx orz-mdhtml@1 new notes.md --title "Field notes"   # a new text twin
npx orz-mdhtml@1 notes.md                             # → notes.md.html
npm i -g orz-mdhtml@1                                 # or: the orz-mdhtml command
```

For a web app, the browser engine and editor component:
`npm i orz-mdhtml-browser@1` (see [In web apps](#in-web-apps)).

## The CLI

```
orz-mdhtml new [file.md] [--title T] [--theme id] [--measure normal|wide|full] [--lang l] [--html] [--cdn | --inline]
orz-mdhtml assemble <file.md> [-o out.md.html] [--cdn | --inline] [--resolve-includes | --no-includes] [--replaces sha256]   (also: orz-mdhtml <file.md>)
orz-mdhtml extract <file.md.html> [-o out.md] [--replaces sha256]
orz-mdhtml upgrade <old.md.html> [-o out.md.html] [--text out.md | --no-text] [--cdn | --inline]
orz-mdhtml inspect <file> [--json]
orz-mdhtml themes
```

| Command | What it does |
|---|---|
| `new` | writes a new text twin: a header with `carrier: md`, a fresh `uid` and the given keys (`--measure normal\|wide\|full`), then a starter body. `--html` also assembles it; without a file name the text goes to stdout (a header to paste onto existing Markdown). |
| `assemble` | writes `x.md.html` (or the `-o` path; missing folders are created) from `x.md` (exact text in, the same bytes every time). Keeps the delivery and the includes the existing file holds (`--cdn` / `--inline` choose the delivery); `--resolve-includes` reads file includes from the text's folder. An include left unresolved shows an "Included file not available" note in the file and is reported once with why (a warning, and `unresolved` in `--json`); a recorded include whose file has changed since is a warning too (`stale` in `--json`). |
| `extract` | writes the exact text twin of an assembled file (`x.md.html` → `x.md`) and reports its includes. Replaces an existing, different `x.md` only when it is a known state (below). A 0.x file is refused with the advice to run `upgrade`; a cut-off file gives a warning. |
| `upgrade` | turns a 0.x file (or a file of an older 1.x shell) into a file of this version, in place by default, and writes its text twin (`x.md`) unless `--no-text`. Keeps the file's delivery unless `--cdn` / `--inline`. Repairs a damaged engine; refuses (unless `--force`) to downgrade a newer shell or to upgrade a file cut off inside its text. |
| `inspect` | diagnoses a text or a file of any version: kind, text format, shell version and how it compares to this tool, delivery, uid, header keys, lint, the file's structure (cut off? engine intact?), the SHA-256 of the text it holds, whether the sibling twin (`x.md` ↔ `x.md.html`) holds the same text (and that text's SHA-256) and which is newer, and advice in plain sentences naming the files. |
| `themes` | lists the theme ids a header may name, with their names (`--json`: `id`, `name`, `scheme`, `default`). |

**Delivery.** Files are **inline** by default: the browser engine is inside the
file (about 1 MB), so it opens without fetching the engine. `--cdn` writes a
small file that loads the engine from
`https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<version>/orz-mdhtml.browser.js`
(the file's own version, e.g. `orz-mdhtml-browser@1.0.2`) — for pages you
publish on the web. Either way the theme stylesheets, KaTeX's
and highlight.js's styles, the content libraries (Mermaid, SMILES, Chart.js)
and the editor (CodeMirror) load from CDNs: reading styled content and editing
need a network connection the first time. **Inline is not offline**: a file
opened with no network shows its text unstyled (no theme, math unstyled, diagrams and
charts not drawn), and Edit falls back to a plain text area. A slow or
unreachable CDN never holds the page blank: the document shows at once,
unstyled, and takes its theme when the stylesheets arrive.

**For scripts and agents.** Every command takes `--json` (one JSON object on
stdout), `--help` and `--force`. Exit status: 0 done, 1 refused or failed, 2
usage error. `assemble` has no content options (`--title`, `--theme`… are
refused with a pointer to the header). Nothing that could hold other work is
overwritten without `--force`: an output that is not an orz file, a
`.md.html` that holds a different text than the one being assembled (it may
hold work saved in the browser — whichever file is newer), an `x.md` that
differs from the text being extracted (it may hold edits — whichever file is
newer), unless what is replaced is a known state (below); a file made by a
newer orz-mdhtml; another document (`upgrade -o`); or (for `new`) any
existing file. With `--force` the replaced file is kept as `<file>~` — or,
when that name is taken by something else, `<file>~1`, `<file>~2`, … (a
backup is never overwritten, and a symbolic link at a backup name is never
followed). Files are replaced through a temporary file and a rename, keeping
their mode; a symbolic link stays a link. `assemble`, `extract` (to a file),
`inspect` and `upgrade` print the `sha256` of the text they wrote or read,
and every `--json` result that wrote a text carries it (`new` prints it only
with `--json`; `themes` never).

**Known states.** `orz-mdhtml assemble x.md` replaces `x.md.html` (or the
`-o` output) without `--force` when the file holds the same text, or **an
earlier state of `x.md`** the CLI can prove; `orz-mdhtml extract x.md.html`
replaces `x.md` when `x.md` itself is a known state:

- (for `x.md.html` and `x.md`, not another `-o` path) a committed version of
  `x.md` — its last commit (`git show HEAD:x.md`), its staged version, or one
  of its 20 most recent commits (`git log -n 20 -- x.md`) — when `x.md` is
  tracked in git (git is used only if installed, for a few seconds at most;
  any failure counts as unknown). A full clone knows what its history holds;
  a shallow checkout (CI's default `--depth 1`) knows only its last commit —
  use `--replaces <sha256>` there. A text equal to one of the twin's last 20
  commits counts as a known earlier state, so a deliberate revert of the
  other file to such a text is replaced — commit the revert first;
- the text `orz-mdhtml` itself last wrote into the output or read out of it,
  for that pair (`new --html`, `assemble`, `extract`, `upgrade` record a
  SHA-256 of the file's text and of the twin's exact text per pair — `x.md`
  and the output path, `-o` included — in `$XDG_CACHE_HOME/orz-mdhtml/`,
  else `~/.cache/orz-mdhtml/`; the record only lifts a refusal when the text
  hashes to exactly that value; a line-ending change is a change) — and,
  for `extract` (and the "only the file changed" advice), only while that
  pair is the last the CLI synced the file with: after `b.md -o
  site.md.html`, `a.md`'s record no longer vouches for `site.md.html`.
  Another document (another uid) is never replaced this way. When the
  record cannot be written (a read-only cache), the command warns: the next
  assemble needs `--replaces` with the hash it printed; a cache the CLI
  cannot write is not read either (its records may be stale);
- **`--replaces <sha256>`** — a portable compare-and-swap for agents in a
  fresh sandbox (no cache, no history): `inspect --json` prints `sha256` (the
  text the inspected file holds; for `x.md`, the SHA-256 of its bytes, as
  `sha256sum`) and `twin.sha256` (the sibling's); `extract` and `assemble`
  print the `sha256` of the text they wrote. `assemble x.md --replaces <h>`
  replaces `x.md.html` only while its text has hash `h`; `extract x.md.html
  --replaces <h>` replaces `x.md` only while it has hash `h`. Any other text
  is refused (`replaces-mismatch`).

So the normal loop — edit `x.md`, assemble, edit, assemble — needs no
`--force`, with or without `-o` (`assemble w.md -o public/w.md.html --cdn`
again and again). The one robust idiom, with no cache, no git, in a shallow
clone: pass the `sha256` the last command printed as `--replaces`. Anything else is refused: notably a save in the browser made in
between (the file then holds work `x.md` lacks), or an `x.md` edited since
the CLI last synced the pair.

**Identity.** A known state says that `x.md` (or an `-o` output) is
unchanged — never that the file beside it holds the same document: another
document's file may have been copied over it. So `extract` and `upgrade`
replace a text as a known state, and `assemble` says "only the file
changed" (`next`: plain `extract x.md.html`), only when both texts carry the
same `uid` (`new` writes one; keep it). Without a shared uid the refusal's
`next` is `extract x.md.html -o x.browser.md`: compare, merge, then assemble
with `--replaces`. A text file is never replaced automatically by another
document's text. `--json` says which rule applied (`replaced`:
`git-head`, `git-index`, `git-log`, `cache`, `token`, or `null`).

**Refusals, for machines.** A `--json` failure is
`{ "ok": false, "command", "error", "reason", "next"?, "exitCode" }`. `reason`
is a stable code; `next` (when one command resolves it) is
`{ "command", "args" }` — run `orz-mdhtml <command> <args…>`. Every command
a refusal suggests (in `next` and in the message) is built from your own
arguments (`-o`, `--cdn`, `--resolve-includes`, `--text`…) and names a copy
(`x.browser.md`, `x.browser-2.md`, …) that does not exist yet:

| `reason` | Meaning | `next` |
|---|---|---|
| `bad-usage` | unknown option, missing argument, options that exclude each other (exit 2) | — |
| `no-such-file`, `unreadable`, `not-utf8` | the input cannot be read as UTF-8 text | — |
| `exists` | `new`: the file exists | — |
| `not-orz` | the output exists and is not an orz file; or the input holds no orz document | `inspect <file>` |
| `twin-differs` | the twin holds a different text that is not a known state (`assemble`: `x.md.html`; `extract`, `upgrade`: `x.md`), or `x.md` is a known state but the two texts do not carry the same uid | `extract x.md.html -o x.browser.md` (when only `x.md.html` changed and both carry the same uid: `extract x.md.html`; a 0.x file: `upgrade x.md.html --text x.browser.md`) |
| `output-differs` | an `-o` output holds another text than the one this pair last had there (saved in the browser, or written from another text), or any output (`extract`/`upgrade`: the text) holds another document (another uid: choose another path) | `extract <out> -o x.browser.md` (another text; when only the output changed and both carry the same uid: `extract <out> -o x.md`); none for another document |
| `replaces-mismatch` | `--replaces`: the file no longer holds the text with that hash | `extract x.md.html -o x.browser.md` |
| `legacy-file` | a 0.x file: `extract` cannot read it; `assemble` will not replace it | `upgrade x.md.html` (next to a text: `--text x.browser.md`) |
| `newer-shell` | the file was made by a newer orz-mdhtml (use `npx orz-mdhtml@latest`) | — |
| `newer-format` | the text's format is newer than this tool writes | — |
| `unclosed-island` | `upgrade`: the file was cut off inside its text | `extract x.md.html -o x.recovered.md` |
| `other-kind` | an orz slides/paged document, known by its file name (`x.slides.md`, `x.paged.html`, …): use its own tool. (An `x.md` whose header says `carrier: slides` is assembled as md without a warning; `inspect` shows the lint warning `carrier-mismatch`.) | — |
| `assembled-input` | `assemble` was given a `.md.html` | `extract x.md.html` |
| `invalid-text` | the text cannot be assembled (NUL, a lone surrogate…) | — |
| `engine-unavailable` | the inline engine is missing or stale (source checkout: `npm run bundle`) | — |
| `write-failed`, `failed` | an output (or its `~` copy) could not be written; anything else | — |

`assemble --json` lists the includes left unresolved as `unresolved: [{
target, kind: "file" | "url", reason }]` (`not-recorded` — pass
`--resolve-includes`; `url` — the CLI fetches no URLs; `no-such-file`,
`outside-folder` — never read, with or without the flag; `unreadable`,
`not-utf8`, `folder-unreadable`), and the recorded file includes whose file
has changed since as `stale: [{ target, kind: "file", reason:
"stale-record" }]` (`--resolve-includes` records the current text).
`inspect --json`'s `twin` is `{ name, holds: "same" | "different" | "none",
newer: "input" | "twin" | "same-time" | "unknown", sha256, earlier? }`, or
`null` when the sibling does not exist — `holds: "none"`: it exists but holds
no orz text; `newer` says which file was modified last: `input` the inspected
one, `twin` its sibling. Inspect the file that exists: `inspect x.md` fails
with `no-such-file` when there is only `x.md.html`.

**Editing an existing document (the safe loop).** Before you edit `x.md`,
run `orz-mdhtml inspect x.md`: if it says `x.md.html` holds a different text
(and not an earlier text of `x.md`), someone saved in the browser —
`orz-mdhtml extract x.md.html -o x.browser.md`, merge it into `x.md`, then
`orz-mdhtml assemble x.md --replaces <twin.sha256>`. If `x.md` has no edits
of its own (inspect says the file holds the newer work), `orz-mdhtml extract
x.md.html` replaces it when it is a known state (or `--replaces <sha256>`).
Only when the text has everything, `orz-mdhtml assemble x.md --force` (the
old file is kept as `x.md.html~`).

## The library

```ts
import { assemble, extract, readDocument, newDocument, inspect, upgrade, THEMES } from 'orz-mdhtml';

const text = newDocument({ title: 'Field notes', theme: 'light-neat-1' });
const html = assemble(text);                     // inline (this release's engine); { delivery: 'cdn' } for the web
extract(html)?.text === text;                    // true: the exact text back
readDocument(text).title;                        // 'Field notes' (header and derived facts, no rendering)
inspect(html).advice;                            // what to do next, for any version
upgrade(oldHtml);                                // { text, html, from, moved, notes } for a 0.x file
```

Exports: `assemble`, `extract`, `readDocument`, `newDocument`, `inspect`,
`upgrade`, `readLegacy`, `THEMES`, `DEFAULT_THEME`, `isThemeId`, `MEASURES`,
`DEFAULT_MEASURE`, `VERSION`, `ORZ_MARKDOWN_VERSION`, `FORMATS`,
`BUNDLE_FILE`, `cdnBundleUrl`, `engineSource`, `engineFiles` (types included).
The Node library writes the same bytes as the browser engine's
`OrzCarrier.assemble` for the same text and options, whichever orz-markdown
2.x your installation resolves (since 1.0.2 a file names the kit version this
release bundles, `ORZ_MARKDOWN_VERSION`). A relative link to a text twin
(`[next](week2.md)`) points at its assembled file (`week2.md.html`) in the
read view and the preview; the text keeps `week2.md`. Includes
(`{{md part.md}}`, `{{md https://…}}`) are shown by a file only from its
`#orz-includes` record: pass them resolved as `assemble(text, { includes })`
(the CLI keeps the existing file's record, and `assemble --resolve-includes`
reads file includes from the text's folder; `upgrade` keeps a file's own). An
include a file does not hold shows a quiet "Included file not available"
note.

## In web apps

The editor every `.md.html` carries is also a component for web apps:
[`orz-mdhtml-browser`](https://github.com/wangyu16/orz-mdhtml/blob/main/browser/README.md) (`npm i orz-mdhtml-browser@1`;
ES module or a plain `<script>` that sets `globalThis.OrzCarrier`). An app
mounts any number of editors, keeps the text wherever it likes through its own
hooks (save, AI with a review step, includes, assets, links, ids), works under
a nonce Content-Security-Policy, and assembles `.md.html` files only when it
needs one. See [docs/embedding.md](docs/embedding.md) (shipped in both
packages: `node_modules/orz-mdhtml-browser/docs/embedding.md`) and the
working example in [`examples/webapp/`](https://github.com/wangyu16/orz-mdhtml/tree/main/examples/webapp).

A platform that shows assembled files in an iframe speaks the host protocols
(`orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`; canonical spec:
orz-markdown `spec/host-protocols.md`, see [PROTOCOL.md](PROTOCOL.md)): the
file then saves to the host, offers the host's AI operations and takes the
host's include resolution.

## With an AI agent

- **Every file explains itself.** The agent banner (an HTML comment before the
  `#orz-src` island) says where the text is, how to unescape it, and links the
  agent skill.
- **The skill.** [`orz-mdhtml-skills/SKILL.md`](orz-mdhtml-skills/SKILL.md)
  (shipped in the package; also at
  `https://cdn.jsdelivr.net/npm/orz-mdhtml@1/orz-mdhtml-skills/SKILL.md`) tells an
  agent how to create, edit, extract, inspect and upgrade documents. For Claude
  Code, copy `orz-mdhtml-skills/` into `~/.claude/skills/orz-mdhtml/`.
- **The loop.** Edit the text twin, never the HTML; `orz-mdhtml assemble`
  again. When unsure what a file is, `orz-mdhtml inspect --json <file>` and
  follow its `advice`; an old file gets `orz-mdhtml upgrade`.

## Keys

In the read view: `Cmd/Ctrl+E` edit, `Cmd/Ctrl+S` save; on the pencil (Tab to
it) `ArrowUp` opens its list. In the editor: `Cmd/Ctrl+S` save, `Cmd/Ctrl+\`
cycles split / editor / preview, `Cmd/Ctrl+Z` undo, `Shift+Cmd/Ctrl+Z` redo,
`Esc` leaves the text for the toolbar, `Cmd/Ctrl+P` in the preview prints the
page (not the preview frame; the read view keeps the browser's print).

## Browser support

| | Chromium (Chrome, Edge, …) | Firefox, Safari |
|---|---|---|
| Read, themes, copy as Markdown | yes | yes |
| Edit (editor, live preview, header pickers) | yes | yes |
| Save in place (File System Access API) | yes — the first Save asks for the file (a picker), later saves write it directly | — Save downloads the file instead |
| Download a copy | download | download |
| New document, Save as new copy | file picker | download |
| Quiet update | saved in place | downloaded |

Only writing to a file on disk needs Chromium's File System Access API;
everything else works in every modern browser. A page served over http(s) is
never saved in place: Save says to use *Download a copy*. A save never
silently overwrites a file that changed on disk since the page opened it
(another program, an agent, any `orz-mdhtml assemble` or `extract`'s twin, not only `--force`): it asks —
*Replace it* or *Download a copy instead*.

## Migrating from 0.x

The 0.x files (orz-mdhtml up to 0.9.3) were experimental and predate text
format 1; 1.0 does not open them as they are. Upgrade each once:

```bash
npx orz-mdhtml@1 inspect old.md.html        # what it is and what to do
npx orz-mdhtml@1 upgrade old.md.html        # → old.md.html (format 1) and old.md (its text twin)
npx orz-mdhtml@1 upgrade old.md.html --text old.browser.md   # when old.md exists (e.g. a 0.x text): then merge
```

With 1.0.0 on npm, a 0.9.x file's own banner ("Framework 1.0.0
available") offers to update it; that update cannot read a 1.0 release and
ends harmlessly with "check your connection" — the file is not changed. Use
`orz-mdhtml upgrade` instead.

`upgrade` keeps the source exactly, moves the `#orz-meta` metadata and the
saved theme into the header (the 0.x `<title>` too, but only when the text has
no heading to give the title; otherwise it is left out, with a warning), keeps the file's delivery, and
mints a `uid` (0.x ids are not valid uids). The 0.9 API (`buildMdHtml` and
friends) and CLI options (`--theme`, `--title` on generation) are gone: content
lives in the text's header now. **The default delivery changed**: 0.x wrote
small files that loaded the engine from the CDN; 1.0 writes **inline** files
(the engine inside, about 1 MB). `upgrade` keeps each file's own delivery;
pass `--cdn` for pages you publish on the web.

## Versions

Two packages, released together with the same version: `orz-mdhtml` (the CLI
and the Node library) and `orz-mdhtml-browser` (the browser engine and editor
component). **Each file carries its own shell**: the version that assembled it
is recorded in the file (`#orz-shell`, `<meta name="generator">`) and keeps
working whatever is installed later; the text format (format 1) is the only
contract between files, tools and apps. A newer tool reads older files;
`inspect` says when a file's shell is older or newer than the tool, and the
quiet update (or `upgrade`) moves a file to a newer shell without touching its
text. Apps pin the component version they want.

## Security — treat these files as programs

A `.md.html` is executable HTML: opening one runs the engine inside it and,
because Markdown may contain raw HTML, anything in the content. Open and edit
files only from sources you trust; appearance proves nothing about who made a
file, and a file cannot prove its own integrity. What the browser limits: no
native code, no silent disk access (Save asks for the file first). The quiet
update only fetches from the hard-coded jsDelivr package of this engine, checks
the bundle's SHA-384 from the release manifest, and runs nothing until the
reader clicks *Update now*.

## Development

See [CLAUDE.md](https://github.com/wangyu16/orz-mdhtml/blob/main/CLAUDE.md) for the architecture, commands and conventions,
[CHANGELOG.md](https://github.com/wangyu16/orz-mdhtml/blob/main/CHANGELOG.md) for releases.

## License

MIT
