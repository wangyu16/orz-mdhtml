// orz-mdhtml-browser has no CommonJS build: `import` it (ES module) or load
// orz-mdhtml.browser.js with a <script> tag (globalThis.OrzCarrier).
throw new Error("orz-mdhtml-browser: require() is not supported. Use `import { mountEditor } from 'orz-mdhtml-browser'` (ES module), or a <script src=\".../orz-mdhtml.browser.js\"> tag that sets globalThis.OrzCarrier.");
