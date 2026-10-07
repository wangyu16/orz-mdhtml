# orz-mdhtml-browser

The browser engine and editor component of [orz-mdhtml](https://github.com/wangyu16/orz-mdhtml):
the same editor every `.md.html` file carries, for web apps too (orz family
contract FC-19).

| File | What |
|---|---|
| `orz-mdhtml.browser.js` | IIFE: sets `globalThis.OrzCarrier` = `{ kind, version, formats, assemble, extract, readDocument, mountEditor, renderPreview }`; inside an assembled `.md.html` it also starts that file (read view, chrome, editing, saving, quiet update) |
| `esm/orz-mdhtml.browser.mjs` | the same API as ES module exports (`import { mountEditor } from 'orz-mdhtml-browser'`) |
| `release.json` | the release manifest the quiet update reads (version, formats, SHA-384 of the bundle) |
| `index.d.ts` | types |

```js
import { mountEditor } from 'orz-mdhtml-browser';
const editor = mountEditor(element, { text, hooks: { async save(text) { /* store the text */ } } });
```

`.md.html` files load the bundle inline or from
`https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<version>/orz-mdhtml.browser.js`.
Embedding guide (hooks, CSP, versions):
[docs/embedding.md](https://github.com/wangyu16/orz-mdhtml/blob/main/docs/embedding.md).
Versioned in lockstep with `orz-mdhtml`; built by its `build/bundle.ts`.

## License

MIT
