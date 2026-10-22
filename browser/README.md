# orz-mdhtml-browser

The browser engine and editor component of
[orz-mdhtml](https://github.com/wangyu16/orz-mdhtml) ("Markdown that edits
itself"): the very bundle every `.md.html` file carries, and the same editor
for web apps (orz family contract FC-19). Built on the carrier kit of
[orz-markdown](https://www.npmjs.com/package/orz-markdown) 2.3.0 (bundled:
this release embeds orz-markdown 2.3.0).

```sh
npm i orz-mdhtml-browser@1
```

| File | What |
|---|---|
| `orz-mdhtml.browser.js` | the IIFE. Sets `globalThis.OrzCarrier` = `{ kind: 'md', version, formats, assemble, extract, readDocument, mountEditor, renderPreview, upgrade, standalone }` (`upgrade(html, options)`: orz-mdhtml's own addition — an old file upgraded in the browser, as the Node library's `upgrade`; a 0.x file keeps its title, metadata and theme, which `extract` alone does not give). Inside an assembled `.md.html` it also starts that file (orz-markdown `carrier/app`: read view, Edit, Save, Download a copy, New document, Save as new copy, host protocols, the quiet update); `OrzCarrier.standalone` is then the file's handle, `null` elsewhere. Anywhere else it only sets the global. |
| `esm/orz-mdhtml.browser.mjs` | ES module exports: `kind`, `version`, `formats`, `assemble`, `extract`, `readDocument`, `renderPreview`, `mountEditor`, `upgrade`, `OrzCarrier` (the same object without `standalone`), `THEMES` (`{ id, name, scheme }`), `DEFAULT_THEME`, `MEASURES`, and `editHeader(text, changes)` — change header keys in a text the way the editor's pickers do (one line per key, the rest of the text untouched; `null` removes a key). Sets no global and boots nothing. |
| `release.json` | the release manifest the quiet update reads: `kind`, `version`, `formats`, `notes`, and `bundle.path` / `bundle.integrity` (the SHA-384 of `orz-mdhtml.browser.js`'s exact bytes). |
| `index.d.ts` | types (`Editor`, `EditorOptions`, `EditorHooks`, `AiProposal`, …). |

```js
import { mountEditor } from 'orz-mdhtml-browser';   // a bundler: the ES module
const editor = mountEditor(element, { text, nonce, hooks: { async save(text) { /* store the text */ } } });
```

```html
<script src="https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@1.0.2/orz-mdhtml.browser.js"></script>
<script>const editor = OrzCarrier.mountEditor(element, { text, hooks: { save } });</script>
```

`.md.html` files carry the bundle inline (the CLI's default) or load it from
`https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<version>/orz-mdhtml.browser.js`
(`--cdn`). The bundle holds no `<script` / `</script`, no CR and only ASCII,
so it can be inlined byte for byte and checked against `release.json`.
`require('orz-mdhtml-browser')` is not supported (it throws): use `import` or
a `<script>` tag.

## Browsers, delivery and limits

- **Reading and editing work in every modern browser.** **Save in place**
  needs Chromium (Chrome, Edge, …: the File System Access API): the first
  Save asks where the file is (a file picker), later saves write it directly;
  elsewhere Save downloads the file. A page served over http(s) never saves
  in place (*Download a copy*).
- **CDN dependence.** Even an inline file (the engine inside) loads its theme
  stylesheets, KaTeX's and highlight.js's styles, Mermaid / SMILES / Chart.js
  and the CodeMirror editor from CDNs (jsDelivr, cdnjs, unpkg); a `--cdn`
  file also loads the engine. **Offline**, a file shows its text unstyled
  (math unstyled, diagrams and charts not drawn) and edits in a plain text
  area; it never hangs blank.
- **Content-Security-Policy.** Under a nonce policy pass your nonce as
  `mountEditor(element, { nonce })`; the component stamps it on its scripts
  and styles and on the preview frame's. The policy and what loads from
  where: `docs/embedding.md`, "Content-Security-Policy".
- **Files are programs.** A `.md.html` runs the engine and any raw HTML in
  its document: open only trusted files; show `renderPreview` output only in
  a sandboxed frame.

Embedding guide (hooks, the AI review flow, CSP, versions): `docs/embedding.md`
in this package ([on GitHub](https://github.com/wangyu16/orz-mdhtml/blob/main/docs/embedding.md)).
Versioned in lockstep with `orz-mdhtml`; built by its `build/bundle.ts`.

## License

MIT
