/**
 * Web-app readiness (claims X.1–X.3): the example app (examples/webapp/)
 * mounts two editors with every FC-19 hook under a nonce CSP and works end to
 * end in real Chrome; the ESM variant; the app author's guide.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { UID_PATTERN } from 'orz-markdown/carrier';
import { assemble } from '../src/assemble.js';
import { bundle, launch, routeCdn, serve, type Browser, type Page } from './browser-env.js';

const b = await bundle();
const browser: Browser | null = await launch();
const site = await serve(process.cwd(), {
  '/browser/orz-mdhtml.browser.js': { body: b.iife },
  '/browser/esm/orz-mdhtml.browser.mjs': { body: b.esm },
});
afterAll(async () => { await browser?.close(); await site.close(); });
const chrome = browser ? describe : describe.skip;

type Ed = {
  getText(): string; setText(t: string): void; undo(): boolean; save(): Promise<{ ok: boolean; via?: string }>; isDirty(): boolean;
  setMode(m: string): void; getMode(): string; focus(): void; requestAi(op: string, o?: { selection?: boolean }): Promise<{ ok: boolean }>;
  uploadAssets(f: File[]): Promise<{ ok: boolean; inserted: string[] }>; ensureUid(): Promise<string>; ready: Promise<unknown>; refreshPreview(): Promise<void>;
};
type Demo = { editors: { a: Ed; b: Ed }; store: Map<string, string>; calls: Array<{ hook: string; detail: string }> };
const CSP_INIT = `(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sample || '')), true); })();`;

async function open(path: string, log: string[]): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser!.newContext();
  await ctx.addInitScript(CSP_INIT);
  await routeCdn(ctx, { log });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${site.url}${path}`);
  return { page, errors };
}

/** The frame whose `#orz-doc` shows `text` (a preview frame), polled. */
async function frameShowing(page: Page, text: string) {
  for (let i = 0; i < 50; i++) {
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      if (await f.evaluate((t) => (document.getElementById('orz-doc')?.textContent ?? '').includes(t), text).catch(() => false)) return f;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`no preview shows ${JSON.stringify(text)}`);
}

chrome('the example web app (real Chrome)', () => {
  it('[X.1] two editors with every hook under a nonce CSP: save, undo per instance, resolveAsset, fetchInclude, resolveLink, uploadAsset, ai, mintUid; chrome none drives the API; no CSP violation, no update check', async () => {
    const log: string[] = [];
    const { page, errors } = await open('/examples/webapp/index.html', log);
    await page.waitForFunction(() => !!(globalThis as unknown as { demo?: unknown }).demo);
    const D = '(globalThis.demo)';
    // the policy is live: an inline event handler is refused (the component uses none)
    expect(await page.evaluate(() => { const d = document.createElement('div'); d.setAttribute('onclick', 'window.__bad = 1'); document.body.append(d); d.click(); d.remove(); return (window as unknown as { __bad?: number }).__bad ?? 'blocked'; })).toBe('blocked');
    await page.waitForFunction(() => (window as unknown as { __csp: string[] }).__csp.length === 1);
    await page.evaluate(() => { (window as unknown as { __csp: string[] }).__csp.length = 0; });

    // two instances: chrome full has the md tools, chrome none has no toolbar
    const tools = await page.evaluate(() => Array.from(document.querySelectorAll('.orz-editor-host')).map((h) => Array.from(h.shadowRoot!.querySelectorAll('button')).map((x) => x.getAttribute('aria-label') ?? x.textContent).filter((n) => n && /^(Theme|Measure|AI|Save)$/.test(n))));
    expect(tools[0]).toEqual(expect.arrayContaining(['Theme', 'Measure', 'AI', 'Save']));
    expect(tools[1]).toEqual([]);

    // save → hooks.save with the exact text; undo stays per instance
    const r = await page.evaluate(async () => {
      const demo = (globalThis as unknown as { demo: Demo }).demo;
      const { a, b } = demo.editors;
      a.setText(`${a.getText()}Edited A.\r\n`);
      b.setText('﻿# B\r\n\r\nedited B\r\n');
      const sa = await a.save();
      const sb = await b.save();
      return { sa, sb, a: demo.store.get('a'), b: demo.store.get('b'), aText: a.getText(), bText: b.getText(), undoA: a.undo(), afterUndoA: a.getText(), bAfter: b.getText() };
    });
    expect(r.sa).toEqual({ ok: true, via: 'hook' });
    expect(r.sb).toEqual({ ok: true, via: 'hook' });
    expect(r.a).toBe(r.aText);
    expect(r.b).toBe('﻿# B\r\n\r\nedited B\r\n');
    expect(r.undoA).toBe(true);
    expect(r.afterUndoA.endsWith('Edited A.\r\n')).toBe(false);
    expect(r.bAfter).toBe(r.bText);

    // the preview (A in preview mode): fetchInclude resolves the include, resolveAsset the image, links as written
    await page.evaluate(`${D}.editors.a.setMode('preview')`);
    const frameA = await frameShowing(page, 'resists pH change');
    const img = await frameA.evaluate(() => document.querySelector('#orz-doc img')?.getAttribute('src'));
    expect(img).toBe(`${site.url}/examples/webapp/figures/curve.png`);
    expect(await frameA.evaluate(() => !!document.querySelector('#orz-doc .katex'))).toBe(true);
    await frameA.locator('a', { hasText: 'week 2' }).click();
    await page.waitForFunction(() => (globalThis as unknown as { demo: Demo }).demo.calls.some((c) => c.hook === 'resolveLink'));

    // upload, AI (whole text, through the API), AI on a selection (the app's button), uid from the app
    const more = await page.evaluate(async () => {
      const demo = (globalThis as unknown as { demo: Demo }).demo;
      const { a, b } = demo.editors;
      const up = await a.uploadAssets([new File(['png'], 'pic one.png', { type: 'image/png' })]);
      const ai = await a.requestAi('sign');
      const uid = await b.ensureUid();
      return { up, ai, aText: a.getText(), uid, bText: b.getText() };
    });
    expect(more.up).toEqual({ ok: true, inserted: ['![pic one](assets/pic%20one.png)'] });
    expect(more.ai).toEqual({ ok: true, op: 'sign' });
    expect(more.aText).toContain('![pic one](assets/pic%20one.png)');
    expect(more.aText.endsWith('— signed by the notes app\n')).toBe(true);
    expect(more.uid).toMatch(UID_PATTERN);
    expect(more.bText).toContain(`uid: ${more.uid}`);
    await page.evaluate(`${D}.editors.b.focus()`);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await page.getByRole('button', { name: 'AI: shout selection' }).click();
    await page.waitForFunction(() => (globalThis as unknown as { demo: Demo }).demo.editors.b.getText().includes('EDITED B'));
    // the app's Save button saves the chrome-less editor through its hook
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await page.waitForFunction(() => { const d = (globalThis as unknown as { demo: Demo }).demo; return d.store.get('b') === d.editors.b.getText(); });

    const hooks = new Set((await page.evaluate(() => (globalThis as unknown as { demo: Demo }).demo.calls)).map((c) => c.hook));
    expect([...hooks].sort()).toEqual(['ai', 'fetchInclude', 'mintUid', 'resolveAsset', 'resolveLink', 'save', 'uploadAsset']);
    // the library view: readDocument without rendering, renderPreview in a sandboxed frame
    expect(await page.locator('#library li').first().textContent()).toContain('Buffers — lecture notes (doc-webappexample01, theme light-academic-1)');
    expect(await page.locator('#thumb').getAttribute('srcdoc')).toContain('resists pH change');
    // no CSP violation, no page error, no update check in an app host
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
    expect(errors).toEqual([]);
    expect(log.filter((u) => u.includes('release.json'))).toEqual([]);
    await page.context().close();
  }, 120_000);

  it('[X.2] the ESM build mounts the same editor, sets no global, and assembles the Node bytes (inline by default, the engine fetched from jsDelivr)', async () => {
    const { page, errors } = await open('/examples/webapp/esm.html', []);
    await page.waitForFunction(() => !!(globalThis as unknown as { demo?: unknown }).demo);
    const r = await page.evaluate(async () => {
      const d = (globalThis as unknown as { demo: { editor: Ed; saved: string[]; assemble(t: string, o: unknown): Promise<string>; version: string; global: unknown } }).demo;
      d.editor.setText('# ESM\n\nchanged\n');
      const s = await d.editor.save();
      return { s, saved: d.saved, version: d.version, global: d.global === undefined, html: await d.assemble('# ESM\n\nchanged\n', { delivery: 'cdn' }), inline: await d.assemble('# ESM\n\nchanged\n', {}) };
    });
    expect(r.s).toEqual({ ok: true, via: 'hook' });
    expect(r.saved).toEqual(['# ESM\n\nchanged\n']);
    expect(r.global).toBe(true);
    expect(r.html === assemble('# ESM\n\nchanged\n', { delivery: 'cdn' })).toBe(true);
    // inline by default: the ES module holds no engine of its own text, so it fetches this release's IIFE from jsDelivr
    expect(r.inline === assemble('# ESM\n\nchanged\n', { engineSource: b.iife })).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
    expect(errors).toEqual([]);
    await page.context().close();
  });
});

describe('the app author\'s guide', () => {
  it('[X.3] docs/embedding.md covers install and import (ESM and IIFE), every export, every hook, the CSP recipe and versions', () => {
    const doc = readFileSync('docs/embedding.md', 'utf8');
    for (const term of ['npm install orz-mdhtml-browser', 'globalThis.OrzCarrier', 'esm/orz-mdhtml.browser.mjs', 'mountEditor', 'assemble', 'extract', 'readDocument', 'renderPreview',
      'save(text)', 'ai.request', 'fetchInclude', 'resolveAsset', 'uploadAsset', 'resolveLink', 'mintUid', 'nonce', 'Content-Security-Policy', "'strict-dynamic'", 'pins the component version', 'files carry their own shells']) {
      expect(doc, term).toContain(term);
    }
    expect(readFileSync('examples/webapp/index.html', 'utf8')).toMatch(/http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-/);
    // the hook table matches the types (browser/index.d.ts): mintUid returns a promise, resolveAsset a string at once (round 3, L8)
    const types = readFileSync('browser/index.d.ts', 'utf8');
    expect(types).toMatch(/mintUid\?\(\): Promise<string>/);
    expect(types).toMatch(/resolveAsset\?\(path: string\): string;/);
    expect(doc).toMatch(/\| `mintUid\(\)` \|[^\n]*\*\*promise\*\* of a `doc-/);
    expect(doc).toMatch(/\| `resolveAsset\(path\)` \|[^\n]*\*\*synchronously\*\*[^\n]*not a promise/);
    expect(doc).not.toMatch(/e\.g\. a signed URL of your storage/);
  });
});
