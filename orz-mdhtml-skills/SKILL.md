---
name: orz-mdhtml
description: Create and use self-contained, editable .md.html documents from Markdown (orz-mdhtml). Use when a user wants a single shareable HTML file that reads like a webpage but can be edited and saved in the browser — e.g. teaching handouts, notes, or published articles.
---

# orz-mdhtml — self-contained editable `.md.html`

`orz-mdhtml` turns a Markdown file into **one `.md.html` file** that:

- reads like a normal themed webpage (rendered in an isolated `<iframe>`),
- can be **edited in the browser** (CodeMirror source + live incremental preview),
- lets readers **switch themes**, **resize text**, **export a local copy**, and
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
  --theme <name>     default theme id (default: light-academic-1)
  --cdn              reference the renderer from jsDelivr (default; small files)
  --inline           embed the renderer bundle (larger file, no renderer fetch)
  --title <text>     document <title>
```

Default `--cdn` produces small files that fetch the renderer
(`orz-mdhtml-browser`) from jsDelivr on first open (cached after). Use
`--inline` only when you want the file to carry its own renderer (~750 KB);
note even `--inline` still fetches themes and editor libraries from CDN.

Theme ids: `light-academic-1/2`, `light-neat-1/2`, `light-playful-1/2`,
`beige-decent-1/2`, `dark-elegant-1/2`.

## Authoring the Markdown

The source is **orz-markdown** Markdown — standard Markdown plus KaTeX math,
`{{name body}}` plugins (mermaid, smiles, qrcode, youtube, toc, …), `::: name`
containers, and `{{attrs[#id .class]}}`. For the full syntax, read the
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
CSS, highlight.js, Mermaid, and — only on first edit — CodeMirror, Split.js,
morphdom. All are CDN-cached after first load.

## Deploying / sharing

- **Distribute the file**: send/host the `.md.html`; readers open it in a browser.
- **Serve it**: any static host works. When served over http(s), readers can't
  save back to the server — the file detects this and tells them to **Download a
  local copy** to edit and save. In-place Save only applies to `file://` copies
  they own.
- **Editing/Save** needs a Chromium browser (Chrome/Edge); reading, themes,
  font size, export, and copy-as-markdown work in all modern browsers.

## Gotchas for agents

- Edit the `.md` and regenerate; never restructure the generated HTML by hand —
  the in-file runtime expects specific element ids (`#orz-src`, `#orz-frame`,
  `#orz-doc`, etc.).
- If you post-process the rendered HTML, **preserve `data-md` and
  `data-src-line` attributes** — they power copy-as-markdown and scroll-sync.
- The embedded source guards `</script>` as `<\/script>`; read it back via the
  `#orz-src` element's `textContent` and reverse that escape.
- Requires `orz-markdown` ≥ 1.2.0 (copy-as-markdown); ≥ 1.2.1 for the
  whole-table/blockquote copy fix.
