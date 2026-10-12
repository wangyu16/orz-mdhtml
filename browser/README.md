# orz-mdhtml-browser

The browser engine and editor component of
[orz-mdhtml](https://github.com/wangyu16/orz-mdhtml) ("Markdown that edits
itself"): the very bundle every `.md.html` file carries, and the same editor
for web apps (orz family contract FC-19). Built on the carrier kit of
[orz-markdown](https://www.npmjs.com/package/orz-markdown) 2.2 (bundled).

```sh
npm i orz-mdhtml-browser@1
```

| File | What |
|---|---|
| `orz-mdhtml.browser.js` | the IIFE. Sets `globalThis.OrzCarrier` = `{ kind: 'md', version, formats, assemble, extract, readDocument, mountEditor, renderPreview, standalone }`. Inside an assembled `.md.html` it also starts that file (orz-markdown `carrier/app`: read view, Edit, Save, Download a copy, New document, Save as new copy, host protocols, the quiet update); `OrzCarrier.standalone` is then the file's handle, `null` elsewhere. Anywhere else it only sets the global. |
| `esm/orz-mdhtml.browser.mjs` | the same API as ES module exports, plus `OrzCarrier`, `THEMES`, `DEFAULT_THEME`, `MEASURES` and `editHeader`. Sets no global and boots nothing. |
| `release.json` | the release manifest the quiet update reads: `kind`, `version`, `formats`, `notes`, and `bundle.path` / `bundle.integrity` (the SHA-384 of `orz-mdhtml.browser.js`'s exact bytes). |
| `index.d.ts` | types (`Editor`, `EditorOptions`, `EditorHooks`, `AiProposal`, …). |

```js
import { mountEditor } from 'orz-mdhtml-browser';   // a bundler: the ES module
const editor = mountEditor(element, { text, nonce, hooks: { async save(text) { /* store the text */ } } });
```

```html
<script src="https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@1.0.1/orz-mdhtml.browser.js"></script>
<script>const editor = OrzCarrier.mountEditor(element, { text, hooks: { save } });</script>
```

`.md.html` files carry the bundle inline (the CLI's default) or load it from
`https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<version>/orz-mdhtml.browser.js`
(`--cdn`). The bundle holds no `<script` / `</script`, no CR and only ASCII,
so it can be inlined byte for byte and checked against `release.json`.
`require('orz-mdhtml-browser')` is not supported (it throws): use `import` or
a `<script>` tag.

Embedding guide (hooks, the AI review flow, CSP, versions): `docs/embedding.md`
in this package ([on GitHub](https://github.com/wangyu16/orz-mdhtml/blob/main/docs/embedding.md)).
Versioned in lockstep with `orz-mdhtml`; built by its `build/bundle.ts`.

## License

MIT
