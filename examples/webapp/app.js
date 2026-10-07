// @ts-check
/// <reference path="../../browser/index.d.ts" />
/**
 * A minimal web app that embeds the orz-mdhtml editor component (FC-19): two
 * editors on one page, every hook wired to in-memory app state, under the
 * page's nonce CSP. The app stores TEXT (the canonical document, FC-18);
 * assembled files are made on demand with `assemble`.
 */
(() => {
  const C = globalThis.OrzCarrier;
  if (!C) throw new Error('orz-mdhtml-browser did not load');
  const NONCE = 'orz-demo-nonce';
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

  /** The app's storage: text by document id (what Alembic would keep in its database). */
  const store = new Map();
  /** Uploaded assets: relative path → object URL. */
  const assets = new Map();
  /** Every hook call, for the log (and the tests). */
  const calls = [];
  const log = (/** @type {string} */ hook, /** @type {string} */ detail) => {
    calls.push({ hook, detail });
    const li = document.createElement('li');
    li.textContent = `${hook}: ${detail}`;
    $('log').prepend(li);
  };

  /** Includes the app resolves under its own policy (here: a fixed table). */
  const INCLUDES = { 'https://example.test/glossary.md': '**Buffer** — resists pH change.\n' };

  /** @param {string} id @returns {import('../../browser/index.d.ts').EditorHooks} */
  const hooksFor = (id) => ({
    async save(text) { store.set(id, text); log('save', `${id} (${text.length} chars)`); refreshLibrary(); },
    resolveAsset(path) { log('resolveAsset', path); return assets.get(path) ?? new URL(path, location.href).href; },
    resolveLink(href) { log('resolveLink', href); return href; },
    async fetchInclude(target) { log('fetchInclude', target); return Object.prototype.hasOwnProperty.call(INCLUDES, target) ? INCLUDES[target] : null; },
    async uploadAsset(file) { const path = `assets/${file.name}`; assets.set(path, URL.createObjectURL(file)); log('uploadAsset', path); return path; },
    ai: {
      operations: [{ id: 'shout', title: 'Shout the selection', selection: true }, { id: 'sign', title: 'Sign the document', selection: false }],
      async request(op, ctx) {
        log('ai', `${op}${ctx.selection ? ` [${ctx.selection.from}, ${ctx.selection.to})` : ''}`);
        if (op === 'shout' && ctx.selection) return { proposed: ctx.text.slice(ctx.selection.from, ctx.selection.to).toUpperCase() };
        return { proposed: `${ctx.text}\n— signed by the notes app\n` };
      },
    },
    async mintUid() {
      const a = new Uint8Array(16); crypto.getRandomValues(a);
      const uid = `doc-${Array.from(a, (b) => (b % 36).toString(36)).join('')}`;
      log('mintUid', uid);
      return uid;
    },
  });

  const A_TEXT = [
    '{{nyml', 'kind: document', 'title: Buffers — lecture notes', 'author: Notes app', 'uid: doc-webappexample01', 'theme: light-academic-1', '}}', '',
    '# Buffers', '', 'A buffer keeps the pH nearly constant. See [week 2](week2.md) and ![a figure](figures/curve.png).', '',
    '{{md https://example.test/glossary.md}}', '', '$$pH = pK_a + \\log\\frac{[A^-]}{[HA]}$$', '',
  ].join('\n');
  const B_TEXT = '# Scratch\n\nquick thoughts here\n';
  store.set('a', A_TEXT);
  store.set('b', B_TEXT);

  const editors = {
    a: C.mountEditor($('editor-a'), { text: A_TEXT, hooks: hooksFor('a'), nonce: NONCE, mode: 'split' }),
    b: C.mountEditor($('editor-b'), { text: B_TEXT, hooks: hooksFor('b'), nonce: NONCE, chrome: 'none', mode: 'editor' }),
  };

  // the app's own controls for the chrome-less editor
  $('b-save').addEventListener('click', () => { void editors.b.save(); });
  $('b-undo').addEventListener('click', () => { editors.b.undo(); });
  $('b-mode').addEventListener('click', () => {
    const order = /** @type {const} */ (['editor', 'split', 'preview']);
    editors.b.setMode(order[(order.indexOf(editors.b.getMode()) + 1) % order.length]);
  });
  $('b-ai').addEventListener('click', () => { void editors.b.requestAi('shout', { selection: true }); });
  $('b-download').addEventListener('click', async () => {
    const text = editors.b.getText();
    const html = await C.assemble(text, { delivery: 'cdn' }); // a small file that loads the engine from jsDelivr
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = 'scratch.md.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // the library: index stored texts without rendering; a read-only preview in a sandboxed frame
  async function refreshLibrary() {
    const ul = $('library');
    ul.replaceChildren();
    for (const [id, text] of store) {
      const info = C.readDocument(text);
      const li = document.createElement('li');
      li.textContent = `${info.title} (${info.meta.uid ?? 'no uid'}, theme ${info.theme ?? 'default'})`;
      ul.append(li);
    }
    const thumb = /** @type {HTMLIFrameElement} */ ($('thumb'));
    thumb.srcdoc = await C.renderPreview(store.get('a') ?? '', { document: true, fetchInclude: async (u) => INCLUDES[u] ?? null });
  }
  $('version').textContent = `orz-mdhtml-browser ${C.version}`;
  void refreshLibrary();

  /** For tests and the console. */
  Object.assign(globalThis, { demo: { editors, store, assets, calls, refreshLibrary } });
})();
