---
name: orz-mdhtml
description: Create and use self-contained, editable .md.html documents from Markdown (orz-mdhtml). Use when a user wants a single shareable HTML file that reads like a webpage but can be edited and saved in the browser — e.g. teaching handouts, notes, or published articles.
---

# orz-mdhtml — self-contained editable `.md.html`

`orz-mdhtml` turns a Markdown file into **one `.md.html` file** that:

- reads like a normal themed webpage (rendered in an isolated `<iframe>`),
- can be **edited in the browser** (CodeMirror source + live incremental preview),
- lets readers **switch themes**, **export a local copy**, and
  **copy rendered content as Markdown source**,
- **saves itself**: in place on local files (Chromium File System Access API),
  or as a download elsewhere.

The Markdown source is embedded in the file as the single source of truth
(`<script type="text/markdown" id="orz-src">`). Saving re-serializes the whole
document, so the file reproduces itself.

## When to use it

- A user wants a **single shareable file** (email/USB/served page) that is both
  readable and editable without any app.
- **Teaching**: a teacher serves a handout as a web page; students download
  their own copy to annotate.
- Prefer plain `.md` when the target is a repo/pipeline; prefer orz-markdown's
  standalone HTML when no editing is needed; use `.md.html` when in-browser
  editing or reader annotation matters.

## Generate a file

Node 18+. The CLI is on npm — run it with `npx` (no install), or `npm i -g
orz-mdhtml`, or `npm run gen --` in a clone:

```bash
npx orz-mdhtml <input.md> [options]
  -o, --out <file>   output path (default: <input>.md.html)
  --theme <name>     default theme id (default: light-neat-3)
  --cdn              reference the renderer from jsDelivr (default; small files)
  --inline           embed the renderer bundle (larger file, no renderer fetch)
  --title <text>     document <title>
```

Default `--cdn` produces small files that fetch the renderer
(`orz-mdhtml-browser`) from jsDelivr on first open (cached after). Use
`--inline` only when you want the file to carry its own renderer (~750 KB);
note even `--inline` still fetches themes and editor libraries from CDN.

Theme ids: `light-neat-1/2/3`, `light-academic-1/2`, `beige-decent-1/2`,
`light-playful-1/2`, `dark-elegant-1/2/3`.

### Portable metadata

To give a generated file machine-readable authorship, license, canonical source,
date, description, or keywords, put a leading `{{nyml kind: meta}}` block in the
Markdown. The builder consumes it and writes standard `<head>` tags plus an
`#orz-meta` JSON island; those emitted records survive later browser saves and
framework updates.

```markdown
{{nyml
kind: meta
title: Field Notes
author: Your Name
license: CC-BY-4.0
license_url: https://creativecommons.org/licenses/by/4.0/
source: https://example.org/field-notes
date: 2026-07-11
}}
```

Programmatic hosts may pass `metadata` to `buildMdHtml`; host values win field
by field. Do not duplicate the metadata block after generation: the normalized
`#orz-meta` island is the generated file's persistent metadata record.

## Authoring the Markdown

The source is **orz-markdown** Markdown — standard Markdown plus KaTeX math,
`{{name body}}` plugins (mermaid, smiles, chart, qrcode, youtube, toc, …),
`::: name` containers, and `{{attrs[#id .class]}}`. For the full syntax, read the
orz-markdown skill, shipped at:

```
node_modules/orz-markdown/orz-markdown-skills/SKILL.md
```

You write only the `.md`; do not hand-write the `.md.html`. To change content,
edit the `.md` and regenerate (or edit in the browser and Save).

## What the generated file needs at view time

"Self-contained" means *one file*, **not** *offline*. **Viewing requires
internet**: the renderer (`orz-mdhtml-browser` from jsDelivr by default, or
embedded with `--inline`), theme CSS (jsDelivr `orz-markdown/themes/...`), KaTeX
CSS, highlight.js, Mermaid, SmilesDrawer, Chart.js, and — only on first edit —
CodeMirror and morphdom. All are CDN-cached after first load.

## Deploying / sharing

- **Distribute the file**: send/host the `.md.html`; readers open it in a browser.
- **Serve it**: any static host works. When served over http(s), readers can't
  save back to the server — the file detects this and tells them to **Download a
  local copy** to edit and save. In-place Save only applies to `file://` copies
  they own.
- **Editing/Save** needs a Chromium browser (Chrome/Edge); reading, themes,
  export, and copy-as-markdown work in all modern browsers.

## Host integration (save + AI)

When a platform embeds the file in an iframe, two independent `postMessage`
protocols activate after a handshake (nothing changes standalone):

- **`orz-host-save@1`** — the file's Save posts to the host instead of the file
  system.
- **`orz-host-ai@1`** — if the host advertises AI operations, selecting text
  shows an *"Improve selection"* assistant; the file sends the passage to the
  host and applies the returned suggestion. The file owns the UI; the host owns
  the model.

Both are specified in [PROTOCOL.md](../PROTOCOL.md). As a file author you don't
write any of this — it's built into the runtime; just know the file *can* be
edited with host-provided save + AI.

## Gotchas for agents

- Edit the `.md` and regenerate; never restructure the generated HTML by hand —
  the in-file runtime expects specific element ids (`#orz-src`, `#orz-frame`,
  `#orz-doc`, etc.).
- If you post-process the rendered HTML, **preserve `data-md` and
  `data-src-line` attributes** — they power copy-as-markdown and scroll-sync.
- The embedded source guards `</script>` as `<\/script>`; read it back via the
  `#orz-src` element's `textContent` and reverse that escape.
- Depends on `orz-markdown` (`^1.4.1`); copy-as-markdown needs ≥ 1.2.0, the
  whole-table/blockquote copy fix landed in ≥ 1.2.1, and explicit image-size
  rendering is fixed in ≥ 1.3.2. Portable document metadata requires ≥ 1.4.0.

## Security

`.md.html` files are **self-contained executable HTML** — opening one runs its
embedded JavaScript. Treat them like programs: only open or edit files from a
trusted source, and advise users the same. The one-click framework update is
opt-in (edit view only, explicit confirm) and always fetches from the hardcoded
canonical jsDelivr packages — a tampered file can't redirect it. A file's
integrity can't be verified from inside it; for authenticity, verify out-of-band.
See the README "Security" section.
