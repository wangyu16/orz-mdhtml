# orz-mdhtml

Turn a Markdown file into a **single, self-contained `.md.html`** — a page that
reads like a normal themed website but is *quietly editable*. Powered by
[orz-markdown](https://www.npmjs.com/package/orz-markdown).

One file. Open it in a browser to read. Click the pencil to edit it. Download
your own copy to annotate. Nothing to install for the reader.

## What a `.md.html` does

1. **Reads like a webpage.** The rendered document fills an isolated `<iframe>`
   (full theme isolation, true WYSIWYG). The only chrome is a small floating
   toolbar in the corner — a reader barely notices it.
2. **Edits in place.** Click the pencil for a minimal editor: a **CodeMirror**
   source pane beside a **live preview** that updates *incrementally*
   (only changed nodes repaint — scroll preserved, no flicker/reload).
3. **Themes.** Switch among orz-markdown's built-in themes live; the chrome,
   editor, and preview all follow the theme's light/dark scheme.
4. **Reader comfort.** Adjust font size (A− / A+) for comfortable reading;
   the choice is remembered.
5. **Copy as Markdown.** Selecting and copying rendered content yields Markdown
   source, not HTML (a table copies as a Markdown table, a TOC as its heading
   links, etc.).
6. **Keep your own copy.** **Export** downloads a local `.md.html`. On a local
   file, **Save** writes back in place (Chromium); on a published page it
   guides you to download a copy instead.

The Markdown source is embedded in the file (`<script type="text/markdown">`)
as the single source of truth; Save/Export re-serialize the whole document.

> "Self-contained" means *works as one file*, not *zero network*. The renderer
> is embedded, but themes and editor libraries (KaTeX, highlight.js, Mermaid,
> CodeMirror, Split.js, morphdom) load from CDN, so **viewing needs internet**.
> Editor libraries are lazy-loaded on first edit, so reading stays light.

## Install / generate

Requires Node 18+. No install needed — run it with `npx`:

```bash
npx orz-mdhtml path/to/doc.md     # → path/to/doc.md.html
open path/to/doc.md.html
```

Or install the CLI globally (`npm i -g orz-mdhtml`), then `orz-mdhtml doc.md`.
To hack on it, clone the repo and use `npm run gen -- doc.md`.

### CLI options

```
orz-mdhtml <input.md> [options]

  -o, --out <file>   output path (default: <input>.md.html)
  --theme <name>     default theme id (default: light-academic-1)
  --cdn              reference the renderer from jsDelivr (default; small files)
  --inline           embed the renderer bundle (larger file, no renderer fetch)
  --title <text>     document <title> (default: input filename)
```

By default (`--cdn`), the renderer is fetched from jsDelivr on first open and
cached, so generated files are small (~tens of KB). Use `--inline` to embed the
renderer (~750 KB) when you want the file to carry its own renderer.

Themes: `light-academic-1/2`, `light-neat-1/2`, `light-playful-1/2`,
`beige-decent-1/2`, `dark-elegant-1/2`. (Readers can switch live in the editor.)

## Browser support

| Feature | Support |
|---|---|
| Read, theme switch, font size, copy-as-markdown, export (download) | All modern browsers |
| Live editing (CodeMirror, incremental preview, Split.js) | All modern browsers |
| **Save in place** (File System Access API) | Chromium (Chrome/Edge); others fall back to Export/download |

## For teaching

The orz-markdown family targets open-source publishing, especially teaching:

- **Teachers** author in Markdown, generate a `.md.html`, and serve it as a web
  page (or hand out the file). They edit their local source in place.
- **Students** open the page, adjust the font, read, then **Download** their own
  copy to add personal notes — no account, no tooling.

## How it works

```
src/browser-entry.ts   exposes window.orzmd.render(); also stamps data-src-line
build/bundle.ts        esbuild: orz-markdown + deps -> dist/orzmd.browser.js (IIFE)
assets/app.js          in-file runtime: modes, live preview, themes, font, save, export, scroll-sync
src/template.ts        builds the .md.html shell (chrome + iframe + embedded source)
src/cli.ts             CLI: foo.md -> foo.md.html
orz-mdhtml-skills/     agent skill describing how to create & use .md.html
```

The preview lives in an iframe so the document theme can't touch the editor
chrome, and the preview is exactly what gets exported. Incremental updates use
morphdom; editor↔preview scroll-sync maps CodeMirror lines to `data-src-line`
anchors (toggleable). Save is *self-reproducing*: it serializes the outer
document with the latest embedded source.

Requires `orz-markdown` ≥ 1.2.0 for copy-as-markdown; ≥ 1.2.1 for the
whole-table/blockquote copy fix.

## Roadmap

- [x] Document-first UI: read / edit, iframe preview, incremental live updates
- [x] Theme picker, reader font size, export, scroll-sync toggle
- [x] copy-as-markdown via orz-markdown core
- [x] Publish `orz-mdhtml` (the CLI) and `orz-mdhtml-browser` (CDN bundle) to npm
- [ ] Optional fully-offline build (inline themes + editor libs)
- [ ] Mermaid/KaTeX live re-render parity in the editor

## Security — treat these as programs, not documents

A `.md.html` is **self-contained executable HTML**: opening one runs the
JavaScript embedded in it (the engine, the editor, and — because the parser allows
raw HTML in the source — potentially anything in the content). The trust model is
the same as **running a downloaded program**, not opening a PDF.

- **Only open or edit files from sources you trust.** Anyone can craft a file that
  looks authentic (same chrome, logo, layout) but contains hostile code. The
  format has no built-in authenticity — appearance proves nothing.
- **What the browser limits.** A page can't run native code or read your disk
  silently (Save uses the File System Access prompt and is scoped to the file you
  pick). Realistic harm from a hostile file is web-context — phishing, exfiltrating
  what you type or paste, beaconing — within the browser sandbox.
- **The one-click update is opt-in and fixed-source.** It only checks for and
  fetches a new framework after you enter edit mode and click **Update**, always
  from the canonical jsDelivr packages over HTTPS (the source is hardcoded in the
  engine — a tampered file cannot redirect it), and it shows the exact URLs for
  confirmation first. Clicking Update places trust in npm + jsDelivr for those
  packages.
- **Integrity can't be self-verified.** A file cannot prove its own integrity (a
  forgery would just lie). If you need authenticity, verify it out-of-band — a
  checksum or signature from the publisher over a trusted channel.

## License

MIT
