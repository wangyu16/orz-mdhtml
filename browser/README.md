# orz-mdhtml-browser

Prebuilt **in-browser renderer** for [orz-mdhtml](https://github.com/wangyu16/orz-mdhtml)
`.md.html` files. It bundles [orz-markdown](https://www.npmjs.com/package/orz-markdown)
for the browser and exposes `window.orzmd.render(markdown)`.

This package exists to be served over a CDN. Generated `.md.html` files in
`--cdn` mode reference it from jsDelivr, so the renderer is fetched from the web
on first open and browser-cached:

```html
<script src="https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<version>/orzmd.browser.js"></script>
```

It is produced from `orz-mdhtml`'s `build/bundle.ts` and versioned in lockstep
with `orz-mdhtml`. You normally don't depend on it directly — generate files
with the `orz-mdhtml` CLI.

## License

MIT
