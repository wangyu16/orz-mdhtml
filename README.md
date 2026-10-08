# orz-mdhtml

**Markdown that edits itself.**

A document is its **text twin** — `notes.md`, plain Markdown with a small
header — and its **self-editing file** `notes.md.html`, one HTML page that
reads like a themed website, edits itself in the browser and saves back in
place. The file is always `assemble(text)`: the text inside it is the
document; everything else is a shell that can be regenerated. Built on the
carrier kit of [orz-markdown](https://www.npmjs.com/package/orz-markdown)
(orz text format 1).

## What a 1.0 `.md.html` is

- **The text twin inside.** The exact text (BOM and line endings kept) rides
  in the file's `<script type="text/markdown" id="orz-src">` island.
  `orz-mdhtml extract` gives it back byte for byte; an agent banner at the top
  of `<body>` tells tools how to read it.
- **A read view.** The document is rendered in the page with the theme and
  line length its header names (`theme`, `measure`); math, code highlighting,
  diagrams, chemistry and charts are drawn once their libraries arrive, and
  copying rendered content copies Markdown.
- **Edit.** The **Edit** button (or Cmd/Ctrl+E) opens the editor: CodeMirror
  beside a live preview (split, editor or preview mode), theme and measure
  pickers that edit the header, undo per document. **Done** goes back to the
  read view. The theme and the measure are document data (they live in the
  header), so choosing one — in the editor or from the read view — changes
  the document: it is unsaved until you Save, and Cmd/Ctrl+Z undoes it.
- **Save, New, Copy.** **Save** (Cmd/Ctrl+S) writes `assemble(text)` — never
  the live page — back to the file. The **More** menu has *Download a copy*,
  *New document* and *Save as new copy* (the same text with a new `uid`). The
  page asks before it closes with unsaved changes.
- **A quiet update.** A local file checks, at most once a day, whether a newer
  release of its engine exists; if so, a small "Update available" indicator
  appears next to the brand. *Update now* re-assembles the same text with the
  new release (its bundle verified by SHA-384) and saves it; nothing changes
  until the reader asks. Served pages, framed pages and pages with a host never
  check.

Content (title, theme, measure, language, author, licence…) comes only from the
text's header:

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

Examples: [`examples/metadata.md`](examples/metadata.md) and its inline
[`metadata.md.html`](examples/metadata.md.html) (metadata in the header),
[`examples/web-page.md`](examples/web-page.md) and its cdn
[`web-page.md.html`](examples/web-page.md.html) (a small file for the web).

## Install

Node 20.16 or newer. Run the CLI with `npx` (nothing to install) or install
it:

```bash
npx orz-mdhtml new notes.md --title "Field notes"   # a new text twin
npx orz-mdhtml notes.md                             # → notes.md.html
npm i -g orz-mdhtml                                 # or: the orz-mdhtml command
```

## The CLI

```
orz-mdhtml new [file.md] [--title T] [--theme id] [--measure m] [--lang l] [--html] [--cdn]
orz-mdhtml assemble <file.md> [-o out.md.html] [--cdn] [--resolve-includes | --no-includes]   (also: orz-mdhtml <file.md>)
orz-mdhtml extract <file.md.html> [-o out.md]
orz-mdhtml upgrade <old.md.html> [-o out.md.html] [--text out.md | --no-text] [--cdn | --inline]
orz-mdhtml inspect <file> [--json]
orz-mdhtml themes
```

| Command | What it does |
|---|---|
| `new` | writes a new text twin: a header with `carrier: md`, a fresh `uid` and the given keys, then a starter body. `--html` also assembles it; without a file name the text goes to stdout. |
| `assemble` | writes `x.md.html` from `x.md` (exact text in, the same bytes every time). Keeps the includes the existing file holds; `--resolve-includes` reads file includes from the text's folder; unresolved includes are warnings. |
| `extract` | writes the exact text twin of an assembled file (`x.md.html` → `x.md`) and reports its includes. A 0.x file is refused with the advice to run `upgrade`; a cut-off file gives a warning. |
| `upgrade` | turns a 0.x file (or a file of an older 1.x shell) into a file of this version, in place by default, and writes its text twin (`x.md`) unless `--no-text`. Keeps the file's delivery unless `--cdn` / `--inline`. Repairs a damaged engine; never downgrades a newer shell without `--force`. |
| `inspect` | diagnoses a text or a file of any version: kind, text format, shell version and how it compares to this tool, delivery, uid, header keys, lint, the file's structure (cut off? engine intact?), whether the sibling twin (`x.md` ↔ `x.md.html`) holds the same text and which is newer, and advice in plain sentences. |
| `themes` | lists the theme ids a header may name. |

**Delivery.** Files are **inline** by default: the browser engine is inside the
file (about 1 MB), so it opens without fetching the engine. `--cdn` writes a
small file that loads the engine from
`https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<version>/orz-mdhtml.browser.js`
— for pages you publish on the web. Either way the theme stylesheets, KaTeX's
and highlight.js's styles, the content libraries (Mermaid, SMILES, Chart.js)
and the editor (CodeMirror) load from CDNs: reading styled content and editing
need a network connection the first time. A slow or unreachable CDN never
holds the page blank: the document shows at once, unstyled, and takes its
theme when the stylesheets arrive.

**For scripts and agents.** Every command takes `--json` (one JSON object on
stdout: the result, or `{ "ok": false, "error", "exitCode" }`), `--help` and
`--force`. Exit status: 0 done, 1 refused or failed, 2 usage error. `assemble`
has no content options (`--title`, `--theme`… are refused with a pointer to
the header). Nothing that could hold other work is overwritten without
`--force`: an output that is not an orz file, a `.md.html` that holds a
different text than the one being assembled (it may hold work saved in the
browser — whichever file is newer) unless that text is a known earlier state
of the twin (below), a text twin changed after its file,
another document (`upgrade -o`), or (for `new`) any existing file. With
`--force` the replaced file is kept as `<file>~`. Files are replaced through
a temporary file and a rename, keeping their mode; a symbolic link stays a
link.

**The assemble rule.** `orz-mdhtml assemble x.md` replaces `x.md.html`
without `--force` when the file holds the same text, or **an earlier state of
`x.md`** that the CLI can prove:

- `x.md`'s last commit (`git show HEAD:x.md`) or its staged version, when
  `x.md` is tracked in git (git is used only if installed; any failure counts
  as unknown);
- the text `orz-mdhtml` itself last wrote into `x.md.html` or read out of it
  (`new --html`, `assemble`, `extract`, `upgrade` record a SHA-256 per pair in
  `$XDG_CACHE_HOME/orz-mdhtml/`, else `~/.cache/orz-mdhtml/`; the record only
  lifts the refusal when the file's text hashes to exactly that value).

So the normal loop — edit `x.md`, assemble, edit, assemble — needs no
`--force`. Any other text is refused: notably a save in the browser made in
between (the file then holds work `x.md` lacks). `--json` says which rule
applied (`replaced`: `git-head`, `git-index`, `cache`, or `null`).

**Editing an existing document (the safe loop).** Before you edit `x.md`,
run `orz-mdhtml inspect x.md`: if it says `x.md.html` holds a different text
(and not an earlier text of `x.md`), someone saved in the browser —
`orz-mdhtml extract x.md.html` first (or `-o x.browser.md` and merge), then
edit and assemble. If `assemble` refuses, do that now; only when the text has
everything, `orz-mdhtml assemble x.md --force` (the old file is kept as
`x.md.html~`).

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
`OrzCarrier.assemble` for the same text and options. Includes
(`{{md part.md}}`, `{{md https://…}}`) are shown by a file only from its
`#orz-includes` record: pass them resolved as `assemble(text, { includes })`
(the CLI keeps the existing file's record, and `assemble --resolve-includes`
reads file includes from the text's folder; `upgrade` keeps a file's own).

## In web apps

The editor every `.md.html` carries is also a component for web apps:
[`orz-mdhtml-browser`](browser/README.md) (`npm install orz-mdhtml-browser`;
ES module or a plain `<script>` that sets `globalThis.OrzCarrier`). An app
mounts any number of editors, keeps the text wherever it likes through its own
hooks (save, AI with a review step, includes, assets, links, ids), works under
a nonce Content-Security-Policy, and assembles `.md.html` files only when it
needs one. See [docs/embedding.md](docs/embedding.md) (shipped in both
packages: `node_modules/orz-mdhtml-browser/docs/embedding.md`) and the
working example in [`examples/webapp/`](examples/webapp/).

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
  `https://cdn.jsdelivr.net/npm/orz-mdhtml/orz-mdhtml-skills/SKILL.md`) tells an
  agent how to create, edit, extract, inspect and upgrade documents. For Claude
  Code, copy `orz-mdhtml-skills/` into `~/.claude/skills/orz-mdhtml/`.
- **The loop.** Edit the text twin, never the HTML; `orz-mdhtml assemble`
  again. When unsure what a file is, `orz-mdhtml inspect --json <file>` and
  follow its `advice`; an old file gets `orz-mdhtml upgrade`.

## Browser support

| | Chromium (Chrome, Edge, …) | Firefox, Safari |
|---|---|---|
| Read, themes, copy as Markdown | yes | yes |
| Edit (editor, live preview, header pickers) | yes | yes |
| Save in place (File System Access API) | yes | — Save downloads the file instead |
| Download a copy | download | download |
| New document, Save as new copy | file picker | download |
| Quiet update | saved in place | downloaded |

Only writing to a file on disk needs Chromium's File System Access API;
everything else works in every modern browser. A page served over http(s) is
never saved in place: Save says to use *Download a copy*. A save never
silently overwrites a file that changed on disk since the page opened it
(another program, an agent, `orz-mdhtml assemble --force`): it asks —
*Replace it* or *Download a copy instead*.

## Migrating from 0.x

The 0.x files (orz-mdhtml up to 0.9.3) were experimental and predate text
format 1; 1.0 does not open them as they are. Upgrade each once:

```bash
npx orz-mdhtml inspect old.md.html          # what it is and what to do
npx orz-mdhtml upgrade old.md.html          # → old.md.html (format 1) and old.md (its text twin)
```

Once 1.0.0 is published, a 0.9.x file's own banner ("Framework 1.0.0
available") offers to update it; that update cannot read a 1.0 release and
ends harmlessly with "check your connection" — the file is not changed. Use
`orz-mdhtml upgrade` instead.

`upgrade` keeps the source exactly, moves the `#orz-meta` metadata, the
saved theme and the `<title>` into the header, keeps the file's delivery, and
mints a `uid` (0.x ids are not valid uids). The 0.9 API (`buildMdHtml` and
friends) and CLI options (`--theme`, `--title` on generation) are gone: content
lives in the text's header now.

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

See [CLAUDE.md](CLAUDE.md) for the architecture, commands and conventions,
[CHANGELOG.md](CHANGELOG.md) for releases.

## License

MIT
