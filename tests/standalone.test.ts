/**
 * Rebuild steps 3–5 — the assembled file in real Chrome (claims R.1–R.10):
 * the read view, the shell's shape, edit and save, header settings, New
 * document / Save as new copy, a host frame, reader preferences, the quiet
 * update, leaving with unsaved changes, editors mounted on the file. Files
 * are assembled with the real bundle and opened over `file:` (and http:);
 * jsDelivr is routed to local files; the picker returns real OPFS handles.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { editHeader, extract, lintHeader, readDocument, UID_PATTERN } from 'orz-markdown/carrier';
import { SAVE_CONFLICT_LABELS, SAVE_CONFLICT_MESSAGE } from 'orz-markdown/carrier/shell';
import { execFileSync } from 'node:child_process';
import { readFileSync as readFile, writeFileSync as writeFile } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../src/assemble.js';
import { assemble as libAssemble } from '../src/lib.js';
import { articleClass, presentationOf, themeHref } from '../src/presentation.js';
import { THEMES } from '../src/themes.js';
import { VERSION } from '../src/version.js';
import { assembleReal, bundle, bootDone, launch, PICKER_INIT, readOpfs, recordErrors, routeCdn, serve, tempDir, writeOpfs, type Browser, type BrowserContext, type Page } from './browser-env.js';
import { corpus } from './helpers.js';

const b = await bundle();
const CORPUS = corpus('md');
const browser: Browser | null = await launch();
const files = tempDir();
const site = await serve(files.dir);
afterAll(async () => { await browser?.close(); await site.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;

type App = {
  file: { fileName: string; delivery: string; uid?: string };
  getText(): string; isDirty(): boolean; edit(): Editor; leave(): Promise<void>; editor(): Editor | null;
  setSetting(c: Record<string, string>): void; undo(): boolean; save(): Promise<unknown>; download(): Promise<unknown>;
  newDocument(): Promise<{ via: string; ok: boolean; name?: string }>; saveAsCopy(): Promise<{ via: string; ok: boolean; name?: string }>;
  ready: Promise<void>;
};
type Editor = {
  getText(): string; setText(t: string): void; setHeader(c: Record<string, string>): void; undo(): boolean; isDirty(): boolean;
  save(): Promise<{ ok: boolean; via?: string; error?: string }>; setMode(m: string): void; getMode(): string; setSplitRatio(r: number): void;
  focus(): void; ready: Promise<unknown>; readonly root: ShadowRoot;
};
const APP = '(globalThis.OrzCarrier.standalone)';

/** Open the handle's list as a pointer does (hover the pencil, orz-markdown A.20) and choose its items in order (a submenu's parent, then its item). */
async function chooseInHandle(page: Page, ...names: string[]): Promise<void> {
  await page.getByRole('button', { name: 'Edit and more', exact: true }).hover();
  for (const name of names) await page.getByRole('menuitem', { name, exact: true }).click();
}
const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

async function context(o: { latest?: { release: string; bundle: string; version: string }; log?: string[] } = {}): Promise<BrowserContext> {
  const ctx = await browser!.newContext({ acceptDownloads: true });
  await ctx.addInitScript(PICKER_INIT);
  await routeCdn(ctx, o);
  return ctx;
}

/** Open a file:// page of an assembled file and put its bytes "on disk" where the OPFS picker finds them. */
async function openFile(ctx: BrowserContext, name: string, html: string, o: { onDisk?: boolean } = {}): Promise<Page> {
  const path = files.write(name, html);
  const page = await ctx.newPage();
  await page.goto(`file://${path}`);
  await bootDone(page);
  if (o.onDisk !== false) await writeOpfs(page, name, html);
  return page;
}

const picks = (page: Page): Promise<Array<{ suggestedName: string; name: string }>> => page.evaluate(() => (window as unknown as { __orzPicks: Array<{ suggestedName: string; name: string }> }).__orzPicks);

chrome('the read view (real Chrome)', () => {
  it('[R.1] inline and cdn files, over file: and http:, render every md corpus document in the page with its theme, measure and title; includes from the file; the runtime runs; no page errors', async () => {
    const log: string[] = [];
    const ctx = await context({ log });
    const page = await ctx.newPage();
    const errors = recordErrors(page);
    for (const c of CORPUS) {
      for (const delivery of ['inline', 'cdn'] as const) {
        const name = `${c.path.replace(/^md\//, '').replace(/\.md$/, '')}-${delivery}.md.html`;
        const html = await assembleReal(c.text, { delivery, ...(c.includes ? { includes: c.includes } : {}) });
        const path = files.write(name, html);
        for (const url of [`file://${path}`, `${site.url}/${name}`]) {
          await page.goto(url);
          await bootDone(page);
          const p = presentationOf(c.text);
          const r = await page.evaluate(() => ({
            title: document.title,
            theme: document.getElementById('orz-theme')?.getAttribute('href'),
            cls: document.getElementById('orz-doc')!.className,
            blocks: document.getElementById('orz-doc')!.childElementCount,
            text: document.getElementById('orz-doc')!.textContent ?? '',
            runtime: typeof (window as unknown as { OrzMarkdownRuntime?: unknown }).OrzMarkdownRuntime,
            qr: [document.querySelectorAll('#orz-doc .qrcode').length, document.querySelectorAll('#orz-doc .qrcode[data-qr-ready="1"]').length],
          }));
          const id = `${c.path} ${delivery} ${url.slice(0, 5)}`;
          expect(r.title, id).toBe(readDocument(c.text, { kind: 'md' }).title);
          expect(r.theme, id).toBe(themeHref(p.theme.id));
          expect(r.cls, id).toBe(articleClass(p.measure));
          expect(r.blocks, id).toBeGreaterThan(0);
          expect(r.runtime, id).toBe('object');
          expect(r.qr[1], id).toBe(r.qr[0]);
          if (c.includes) for (const inc of Object.values(c.includes)) expect(r.text, id).toContain(inc.split(/\r?\n/).find((l) => /\w/.test(l))!.replace(/^#+\s*|^- /, '').slice(0, 12));
        }
      }
    }
    expect(errors).toEqual([]);
    // includes come from the file: nothing was fetched for them
    expect(log.filter((u) => u.includes('example.org'))).toEqual([]);
    await ctx.close();
  }, 300_000);

  it('[R.1] themes apply in the page (a light and a dark theme differ), and copy-as-Markdown copies Markdown', async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    const bg: Record<string, string> = {};
    for (const id of ['light-neat-3', 'dark-elegant-3']) {
      const text = editHeader('# Themed\n\nSome **bold** text.\n', { theme: id });
      await page.goto(`file://${files.write(`theme-${id}.md.html`, await assembleReal(text))}`);
      await bootDone(page);
      await page.waitForFunction(() => Array.from(document.styleSheets).some((s) => (s.href ?? '').includes('/themes/')));
      bg[id] = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    }
    expect(bg['light-neat-3']).not.toBe(bg['dark-elegant-3']);
    const copied = await page.evaluate(() => {
      const p = document.querySelector('#orz-doc p')!;
      const range = document.createRange();
      range.selectNodeContents(p);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      const dt = new DataTransfer();
      p.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(copied).toContain('**bold**');
    await ctx.close();
  });

  it('[R.2] the shell: head links from the header, body = island, read view, chrome mount, engine; the chrome lives in a shadow root and adds nothing to the page\'s styles', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/every-construct.md')!.text;
    const page = await openFile(ctx, 'shape.md.html', await assembleReal(text), { onDisk: false });
    const r = await page.evaluate(() => ({
      body: Array.from(document.body.children).map((e) => `${e.tagName.toLowerCase()}#${e.id}`),
      sheets: Array.from(document.styleSheets).map((s) => (s.ownerNode as Element | null)?.id ?? '').filter(Boolean),
      lightButtons: document.querySelectorAll('.orz-btn, [data-orz-chrome] ~ button').length,
      shadow: !!document.getElementById('orz-chrome')!.shadowRoot,
      buttons: Array.from(document.getElementById('orz-chrome')!.shadowRoot!.querySelectorAll('button')).map((x) => x.getAttribute('aria-label')),
    }));
    // the kit's app puts the chrome first in the page order after the island (orz-markdown A.18), then the read view; the engine last
    expect(r.body[0]).toBe('script#orz-src');
    expect(r.body.slice(1, 3)).toEqual(['div#orz-chrome', 'main#orz-view']);
    expect(r.body[3]).toBe('script#orz-engine');
    expect(r.sheets).toEqual(['orz-theme', 'orz-katex', 'orz-hljs']);
    expect(r.lightButtons).toBe(0);
    expect(r.shadow).toBe(true);
    // the read view's one control, the pencil (its list holds every operation); Done and More belong to edit mode's bar
    expect(r.buttons).toEqual(['Edit and more', 'Done', 'More']);
    await ctx.close();
  });
});

chrome('edit, settings and saves (real Chrome)', () => {
  it('[R.3] Edit → type → Save writes exactly assemble(text) through the picker (never the live DOM); the second save reuses the handle; the file reopens with the text', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/minimal.md')!.text;
    const html = await assembleReal(text);
    const page = await openFile(ctx, 'typed.md.html', html);
    await page.getByRole('button', { name: 'Edit and more', exact: true }).click();
    await page.evaluate(`${APP}.editor().ready`);
    await page.evaluate(`${APP}.editor().focus()`);
    await page.keyboard.press(isMac ? 'Meta+ArrowDown' : 'Control+End');
    await page.keyboard.type('\nTyped in Chrome.');
    await page.evaluate(() => { const m = document.createElement('div'); m.id = 'live-dom-marker'; m.textContent = 'LIVE-DOM-MARKER'; document.body.append(m); });
    const typed = await page.evaluate(`${APP}.getText()`) as string;
    expect(typed.startsWith(text.replace(/\n$/, ''))).toBe(true);
    expect(typed).toContain('Typed in Chrome.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(`!${APP}.isDirty()`);
    const written = await readOpfs(page, 'typed.md.html');
    expect(written === assemble(typed, { engineSource: b.iife })).toBe(true);
    expect(written).not.toContain('LIVE-DOM-MARKER');
    expect(await picks(page)).toHaveLength(1);
    // a second save: no second picker
    await page.evaluate(`${APP}.editor().focus()`);
    await page.keyboard.type(' Again.');
    const again = await page.evaluate(`${APP}.getText()`) as string;
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForFunction(`!${APP}.isDirty()`);
    expect(await readOpfs(page, 'typed.md.html') === assemble(again, { engineSource: b.iife })).toBe(true);
    expect(await picks(page)).toHaveLength(1);
    // the written file opens with the text
    const reopened = await openFile(ctx, 'typed-reopened.md.html', (await readOpfs(page, 'typed.md.html'))!, { onDisk: false });
    expect(await reopened.evaluate(`${APP}.getText()`)).toBe(again);
    expect(await reopened.locator('#orz-doc').textContent()).toContain('Typed in Chrome. Again.');
    await ctx.close();
  });

  it('[R.3] a served page (http:) is not saved in place: Save returns { ok: false, via: \'served-notice\' }, says to use Download a copy, and writes nothing', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/minimal.md')!.text;
    files.write('served.md.html', await assembleReal(text));
    const page = await ctx.newPage();
    await page.goto(`${site.url}/served.md.html`);
    await bootDone(page);
    await page.evaluate(`${APP}.setSetting({ theme: 'dark-elegant-1' })`);
    const r = await page.evaluate(`${APP}.save()`);
    expect(r).toEqual({ ok: false, via: 'served-notice', error: 'served page' });
    expect(await picks(page)).toHaveLength(0);
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    const toast = await page.evaluate(`Array.from(${APP}.root.querySelectorAll('.orz-toast')).map((t) => t.textContent).join(' | ')`) as string;
    expect(toast).toContain('This file was opened from a web address, so it cannot be saved over. Use “Download a copy” (⋯) to keep your changes.');
    await ctx.close();
  });

  it('[R.3] a save keeps the file\'s form: a cdn file stays cdn, a file\'s includes are kept, a CR LF + BOM text stays exact', async () => {
    const ctx = await context();
    const inc = CORPUS.find((c) => c.path === 'md/includes.md')!;
    const crlf = CORPUS.find((c) => c.path === 'md/crlf.md')!;
    const cases = [
      { name: 'cdn-kept.md.html', text: CORPUS.find((c) => c.path === 'md/minimal.md')!.text, o: { delivery: 'cdn' as const } },
      { name: 'includes-kept.md.html', text: inc.text, o: { includes: inc.includes! } },
      { name: 'crlf-kept.md.html', text: `﻿${crlf.text}`, o: {} },
    ];
    for (const c of cases) {
      const page = await openFile(ctx, c.name, await assembleReal(c.text, c.o));
      const edited = await page.evaluate(async () => {
        const app = (globalThis as unknown as { OrzCarrier: { standalone: App } }).OrzCarrier.standalone;
        const ed = app.edit();
        const t = ed.getText();
        ed.setText(`${t}more${t.includes('\r\n') ? '\r\n' : '\n'}`);
        const r = await ed.save();
        return { r, text: ed.getText() };
      });
      expect(edited.r, c.name).toMatchObject({ ok: true, via: 'file' });
      const expected = (c.o as { delivery?: string }).delivery === 'cdn' ? assemble(edited.text, c.o) : assemble(edited.text, { ...c.o, engineSource: b.iife });
      expect(await readOpfs(page, c.name) === expected, c.name).toBe(true);
      expect(extract(expected)!.text).toBe(edited.text);
      await page.close();
    }
    await ctx.close();
  });

  it('[R.4] theme and measure write the header: outside edit mode through editHeader (dirty, the page restyles, Cmd/Ctrl+Z undoes), in edit mode as one undoable setHeader edit; the saved file carries them', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/minimal.md')!.text;
    const page = await openFile(ctx, 'settings.md.html', await assembleReal(text));
    const nocturne = THEMES.find((t) => t.id === 'dark-elegant-3')!;
    await chooseInHandle(page, 'Theme');
    await page.getByRole('menuitemradio', { name: nocturne.name, exact: true }).click();
    let t = await page.evaluate(`${APP}.getText()`) as string;
    expect(t).toBe(editHeader(text, { theme: 'dark-elegant-3' }));
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    // the kit's swapStylesheet moves the id to the new sheet once it has loaded (no unstyled moment)
    await expect.poll(() => page.locator('#orz-theme').getAttribute('href')).toBe(themeHref('dark-elegant-3'));
    await chooseInHandle(page, 'Width');
    await page.getByRole('menuitemradio', { name: 'Full width', exact: true }).click();
    t = await page.evaluate(`${APP}.getText()`) as string;
    expect(t).toBe(editHeader(text, { theme: 'dark-elegant-3', measure: 'full' }));
    expect(await page.locator('#orz-doc').getAttribute('class')).toBe('markdown-body measure-full');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press(`${MOD}+z`);
    expect(await page.evaluate(`${APP}.getText()`)).toBe(editHeader(text, { theme: 'dark-elegant-3' }));
    await page.keyboard.press(`${MOD}+z`);
    expect(await page.evaluate(`${APP}.getText()`)).toBe(text);
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(false);
    // edit mode: the editor's toolbar picker, one undoable edit, the preview follows
    await page.getByRole('button', { name: 'Edit and more', exact: true }).click();
    await page.evaluate(`${APP}.editor().ready`);
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Academic', exact: true }).click();
    expect(await page.evaluate(`${APP}.editor().getText()`)).toBe(editHeader(text, { theme: 'light-academic-1' }));
    await page.waitForFunction(() => Array.from(document.getElementById('orz-chrome')!.shadowRoot!.querySelectorAll('.orz-editor-host')).some((h) => Array.from(h.shadowRoot!.querySelectorAll('iframe')).some((f) => f.srcdoc.includes('themes/light-academic-1.css'))));
    expect(await page.evaluate(`${APP}.editor().undo()`)).toBe(true);
    expect(await page.evaluate(`${APP}.editor().getText()`)).toBe(text);
    expect(await page.evaluate(`${APP}.editor().isDirty()`)).toBe(false);
    await page.evaluate(`${APP}.editor().redo()`);
    // the saved file is the assembly of the text: its head names the new theme
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForFunction(`!${APP}.isDirty()`);
    const saved = (await readOpfs(page, 'settings.md.html'))!;
    expect(saved === assemble(editHeader(text, { theme: 'light-academic-1' }), { engineSource: b.iife })).toBe(true);
    expect(saved).toContain(themeHref('light-academic-1'));
    // leaving edit mode re-renders the read view from the current text
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect.poll(() => page.locator('#orz-theme').getAttribute('href')).toBe(themeHref('light-academic-1'));
    await ctx.close();
  });

  it('[R.5] New document and Save as new copy write valid new files through the picker (new uid, lint clean, the file\'s delivery) and leave the opened file alone', async () => {
    const ctx = await context();
    const orig = CORPUS.find((c) => c.path === 'md/every-construct.md')!.text;
    for (const delivery of ['inline', 'cdn'] as const) {
      const name = `origin-${delivery}.md.html`;
      const html = await assembleReal(orig, { delivery });
      const page = await openFile(ctx, name, html);
      const n = await page.evaluate(`${APP}.newDocument()`) as { via: string; ok: boolean; name?: string };
      expect(n).toMatchObject({ via: 'file', ok: true, name: 'Untitled.md.html' });
      const c = await page.evaluate(`${APP}.saveAsCopy()`) as { via: string; ok: boolean; name?: string };
      expect(c).toMatchObject({ via: 'file', ok: true, name: `origin-${delivery} copy.md.html` });
      expect((await picks(page)).map((p) => p.suggestedName)).toEqual(['Untitled.md.html', `origin-${delivery} copy.md.html`]);
      const origUid = readDocument(orig, { kind: 'md' }).meta.uid;
      for (const file of ['Untitled.md.html', `origin-${delivery} copy.md.html`]) {
        const made = (await readOpfs(page, file))!;
        const ex = extract(made)!;
        const info = readDocument(ex.text, { kind: 'md' });
        expect(ex.delivery, file).toBe(delivery);
        expect(ex.shell, file).toBe(VERSION);
        expect(info.meta.uid, file).toMatch(UID_PATTERN);
        expect(info.meta.uid, file).not.toBe(origUid);
        expect(lintHeader(ex.text, 'md').filter((l) => l.level === 'error'), file).toEqual([]);
        expect(made === (delivery === 'cdn' ? assemble(ex.text, { delivery }) : assemble(ex.text, { engineSource: b.iife })), file).toBe(true);
        // it opens
        const opened = await openFile(ctx, `${delivery}-${file}`, made, { onDisk: false });
        expect(await opened.evaluate(`${APP}.getText()`)).toBe(ex.text);
        expect(await opened.locator('#orz-doc h1').count()).toBeGreaterThan(0);
        await opened.close();
      }
      // the copy is the same text with a new uid
      const copy = extract((await readOpfs(page, `origin-${delivery} copy.md.html`))!)!.text;
      expect(copy).toBe(editHeader(orig, { uid: readDocument(copy, { kind: 'md' }).meta.uid! }));
      // the opened file is untouched
      expect(await readOpfs(page, name) === html).toBe(true);
      await page.close();
    }
    await ctx.close();
  });

  it('[R.7] reader preferences (view mode, split) are stored by uid, never in the file, and come back on reopening', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/every-construct.md')!.text;
    const uid = readDocument(text, { kind: 'md' }).meta.uid!;
    expect(uid).toMatch(UID_PATTERN);
    const page = await openFile(ctx, 'prefs.md.html', await assembleReal(text));
    await page.evaluate(async () => {
      const app = (globalThis as unknown as { OrzCarrier: { standalone: App } }).OrzCarrier.standalone;
      const ed = app.edit();
      ed.setMode('preview');
      ed.setSplitRatio(0.3);
      ed.setText(`${ed.getText()}x\n`);
      await ed.save();
    });
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(keys.filter((k) => k.startsWith('orz-pref:'))).toEqual([`orz-pref:${uid}:splitRatio`, `orz-pref:${uid}:viewMode`]);
    expect(keys.filter((k) => !k.startsWith('orz-pref:') && !k.startsWith('orz-update'))).toEqual([]);
    const saved = (await readOpfs(page, 'prefs.md.html'))!;
    expect(saved === assemble(`${text}x\n`, { engineSource: b.iife })).toBe(true);
    const withoutEngine = saved.replace(/<script id="orz-engine">[\s\S]*?<\/script>/, '');
    expect(withoutEngine).not.toMatch(/viewMode|splitRatio|0\.3/);
    const again = await openFile(ctx, 'prefs.md.html', saved);
    expect(await again.evaluate(`${APP}.edit().getMode()`)).toBe('preview');
    // the file's one preference store is what an editor mounted on the file gets
    expect(await again.evaluate(`${APP}.editorContext().preferences.get('viewMode')`)).toBe('preview');
    await ctx.close();
  });
});

chrome('host frame and quiet update (real Chrome)', () => {
  it('[R.6] in a host frame: saves (read view and editor) go to the host with the exact text and assemble(text); AI and includes come from the host; no picker, no update check', async () => {
    const log: string[] = [];
    const ctx = await context({ log });
    const inc = CORPUS.find((c) => c.path === 'md/includes.md')!;
    const fileHtml = await assembleReal(inc.text, { includes: inc.includes! });
    files.write('hosted.md.html', fileHtml);
    const hostSite = await serve(files.dir, {
      '/host.html': {
        body: `<!doctype html><html><body><iframe id="f" src="${site.url}/hosted.md.html" style="width:1200px;height:600px"></iframe><script>
          window.got = [];
          const f = document.getElementById('f');
          const post = (m) => f.contentWindow.postMessage(m, '*');
          const hello = () => { post({ type: 'orz-host-hello', protocol: 'orz-host-save', version: 1 }); post({ type: 'orz-host-ai-hello', protocol: 'orz-host-ai', version: 1, operations: [{ id: 'sign', title: 'Sign it', selection: false }] }); post({ type: 'orz-host-include-hello', protocol: 'orz-host-include', version: 1 }); };
          const t = setInterval(hello, 300);
          addEventListener('message', (e) => {
            if (e.source !== f.contentWindow) return;
            const d = e.data; window.got.push(d);
            if (d.type === 'orz-host-ready') clearInterval(t);
            if (d.type === 'orz-host-save') post({ type: 'orz-host-saved', ok: true });
            if (d.type === 'orz-host-ai-request') post({ type: 'orz-host-ai-result', protocol: 'orz-host-ai', version: 1, requestId: d.requestId, ok: true, proposed: d.text + 'Signed by the host.\\n' });
            if (d.type === 'orz-host-include-request') post({ type: 'orz-host-include-result', protocol: 'orz-host-include', version: 1, requestId: d.requestId, ok: true, markdown: 'HOST-RESOLVED glossary\\n' });
          });
        </script></body></html>`,
      },
    });
    const page = await ctx.newPage();
    await page.goto(`${hostSite.url}/host.html`);
    await page.waitForFunction(() => (window as unknown as { got: Array<{ type: string }> }).got.some((m) => m.type === 'orz-host-ready'));
    const frame = page.frames().find((f) => f.url().endsWith('/hosted.md.html'))!;
    await frame.waitForFunction(() => !!(globalThis as unknown as { OrzCarrier?: { standalone?: unknown } }).OrzCarrier?.standalone);
    // the host's include resolution wins over the file's record in the read view
    await frame.waitForFunction(() => (document.getElementById('orz-doc')?.textContent ?? '').includes('HOST-RESOLVED'));
    // a read-view save (after a theme change) goes to the host
    await frame.evaluate(`${APP}.setSetting({ theme: 'beige-decent-1' })`);
    const t1 = await frame.evaluate(`${APP}.getText()`) as string;
    expect(await frame.evaluate(`${APP}.save()`)).toMatchObject({ via: 'host', ok: true });
    // the editor's save goes to the host too; AI from the host, reviewed, one undoable edit
    await frame.evaluate(`${APP}.edit().ready`);
    await frame.getByRole('button', { name: 'AI', exact: true }).click();
    await frame.getByRole('menuitem', { name: 'Sign it' }).click();
    await frame.getByRole('button', { name: 'Replace document' }).click();
    await frame.waitForFunction(`${APP}.editor().getText().endsWith('Signed by the host.\\n')`);
    const t2 = await frame.evaluate(`${APP}.editor().getText()`) as string;
    expect(t2).toBe(`${t1}Signed by the host.\n`);
    expect(await frame.evaluate(`${APP}.editor().save()`)).toMatchObject({ ok: true, via: 'host' });
    const got = await page.evaluate(() => (window as unknown as { got: Array<{ type: string; source?: string; html?: string; dirty?: boolean }> }).got);
    const saves = got.filter((m) => m.type === 'orz-host-save');
    expect(saves.map((s) => s.source)).toEqual([t1, t2]);
    for (const s of saves) expect(s.html === assemble(s.source!, { engineSource: b.iife, includes: inc.includes! })).toBe(true);
    expect(got.some((m) => m.type === 'orz-host-dirty' && m.dirty === true)).toBe(true);
    expect(await frame.evaluate(() => (window as unknown as { __orzPicks: unknown[] }).__orzPicks)).toEqual([]);
    expect(log.filter((u) => u.includes('release.json'))).toEqual([]);
    expect(await frame.evaluate(() => !!document.getElementById('orz-chrome')!.shadowRoot!.querySelector('.orz-update-indicator'))).toBe(false);
    await hostSite.close();
    await ctx.close();
  }, 120_000);

  it('[R.8] the quiet update: a newer release marks the pencil and offers "Update to x.y.z" in its list; Update now writes the new release\'s assembly of the exact text into the opened file and reloads', async () => {
    const next = await bundle('9.9.9');
    const log: string[] = [];
    const ctx = await context({ latest: { release: next.release, bundle: next.iife, version: '9.9.9' }, log });
    const text = CORPUS.find((c) => c.path === 'md/crlf.md')!.text;
    const html = await assembleReal(text);
    const page = await openFile(ctx, 'update-me.md.html', html);
    // the offer in the read view: a dot on the pencil, "Update to 9.9.9" in its list
    await page.locator('#orz-chrome .orz-handle__pencil[data-update="true"]').waitFor();
    const reloaded = page.waitForEvent('load');
    await chooseInHandle(page, 'Update to 9.9.9', 'Update now');
    await reloaded;
    const written = (await readOpfs(page, 'update-me.md.html'))!;
    const ex = extract(written)!;
    expect(ex.text === text).toBe(true);
    expect(ex).toMatchObject({ shell: '9.9.9', delivery: 'inline', kind: 'md' });
    expect(written).toContain(`<script id="orz-engine">${next.iife}</script>`);
    expect(log.filter((u) => u.endsWith('/release.json'))).toHaveLength(1);
    await ctx.close();
  }, 120_000);
});

chrome('leaving with unsaved changes, editors mounted on the file (real Chrome)', () => {
  /** Record dialogs (and dismiss them: a dismissed beforeunload keeps the page). */
  const dialogsOf = (page: Page): string[] => {
    const seen: string[] = [];
    page.on('dialog', (d) => { seen.push(d.type()); void d.dismiss().catch(() => undefined); });
    return seen;
  };
  /** Ask the page to close as a reader would (beforeunload runs); true when it stayed open. */
  const tryClose = async (page: Page): Promise<boolean> => {
    await page.close({ runBeforeUnload: true });
    await new Promise((r) => setTimeout(r, 500));
    return !page.isClosed();
  };

  it('[R.9] a top-level file with unsaved changes asks before the page goes (typed or a header setting); clean, saved or after the update\'s reload it does not', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/minimal.md')!.text;
    const html = await assembleReal(text);
    // clean: nothing asked
    const clean = await openFile(ctx, 'leave-clean.md.html', html);
    const cleanDialogs = dialogsOf(clean);
    await clean.mouse.click(400, 300); // sticky user activation: Chrome asks only after the reader interacted
    expect(await tryClose(clean)).toBe(false);
    expect(cleanDialogs).toEqual([]);

    // typed in the editor: asked, and dismissing keeps the page and the text; after a save: not asked
    const typed = await openFile(ctx, 'leave-typed.md.html', html);
    const typedDialogs = dialogsOf(typed);
    await typed.getByRole('button', { name: 'Edit and more', exact: true }).click();
    await typed.evaluate(`${APP}.editor().ready`);
    await typed.evaluate(`${APP}.editor().focus()`);
    await typed.keyboard.type('Unsaved words.');
    expect(await typed.evaluate(`${APP}.isDirty()`)).toBe(true);
    expect(await tryClose(typed)).toBe(true);
    expect(typedDialogs).toEqual(['beforeunload']);
    expect(await typed.evaluate(`${APP}.getText()`)).toContain('Unsaved words.');
    await typed.keyboard.press(`${MOD}+s`);
    await typed.waitForFunction(`!${APP}.isDirty()`);
    expect(await tryClose(typed)).toBe(false);
    expect(typedDialogs).toEqual(['beforeunload']);

    // a header setting outside edit mode makes the document unsaved: asked; undone back to the saved text: not asked
    const setting = await openFile(ctx, 'leave-setting.md.html', html);
    const settingDialogs = dialogsOf(setting);
    await setting.mouse.click(400, 300);
    await setting.evaluate(`${APP}.setSetting({ theme: 'dark-elegant-1' })`);
    expect(await setting.evaluate(`${APP}.isDirty()`)).toBe(true);
    expect(await tryClose(setting)).toBe(true);
    expect(settingDialogs).toEqual(['beforeunload']);
    await setting.evaluate(`${APP}.undo()`);
    expect(await setting.evaluate(`${APP}.isDirty()`)).toBe(false);
    expect(await tryClose(setting)).toBe(false);
    expect(settingDialogs).toEqual(['beforeunload']);
    await ctx.close();

    // the quiet update writes the current (unsaved) text into the opened file, then reloads: nothing asked
    const next = await bundle('9.9.9');
    const uctx = await context({ latest: { release: next.release, bundle: next.iife, version: '9.9.9' } });
    const page = await openFile(uctx, 'leave-update.md.html', html);
    const updateDialogs = dialogsOf(page);
    await page.mouse.click(400, 300);
    await page.evaluate(`${APP}.setSetting({ theme: 'dark-elegant-1' })`);
    const current = await page.evaluate(`${APP}.getText()`) as string;
    // the offer in the read view: a dot on the pencil, "Update to 9.9.9" in its list
    await page.locator('#orz-chrome .orz-handle__pencil[data-update="true"]').waitFor();
    const reloaded = page.waitForEvent('load');
    await chooseInHandle(page, 'Update to 9.9.9', 'Update now');
    await reloaded;
    expect(updateDialogs).toEqual([]);
    const written = extract((await readOpfs(page, 'leave-update.md.html'))!)!;
    expect(written.text === current).toBe(true);
    expect(written.shell).toBe('9.9.9');
    await uctx.close();
  }, 120_000);

  it('[R.10] an editor mounted on the file (OrzCarrier.mountEditor, no hooks.save) is the document being edited: Cmd/Ctrl+S on the page or in it saves it (a newer-format one is read-only — it may take the focus — and writes nothing), never the page\'s other copy; its unsaved changes ask before leaving; destroyed after saving, the page keeps the text it saved (kit round 5, B3) and the keys are the page\'s again', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/minimal.md')!.text;
    const page = await openFile(ctx, 'attached.md.html', await assembleReal(text));
    const dialogs = dialogsOf(page);
    const mount = (t: string): Promise<unknown> => page.evaluate(`(async () => {
      const el = document.createElement('div'); el.style.cssText = 'width: 900px; height: 500px'; document.body.append(el);
      window.__attached = globalThis.OrzCarrier.mountEditor(el, { text: ${JSON.stringify(t)} });
      await window.__attached.ready;
    })()`);
    // a newer-format text: read-only (it may take the focus, for selection and copy); Cmd/Ctrl+S in it or on the page writes nothing
    const newer = '{{nyml\nkind: document\nformat: 2\n}}\n\nFrom a newer release.\n';
    await mount(newer);
    expect(await page.evaluate('window.__attached.isReadOnly ? window.__attached.isReadOnly() : true')).toBe(true);
    await page.evaluate('window.__attached.focus()');
    await page.keyboard.press(`${MOD}+s`);
    await page.mouse.click(5, 5);
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForTimeout(600);
    expect(await picks(page)).toHaveLength(0);
    expect(await page.evaluate('window.__attached.getText()')).toBe(newer);
    expect(await readOpfs(page, 'attached.md.html')).toBe(await assembleReal(text)); // the opened file, untouched
    await page.evaluate('window.__attached.destroy()');
    // a writable one, changed: Cmd/Ctrl+S with the focus outside it saves ITS text into the file
    await mount(text);
    await page.evaluate(`window.__attached.setText(${JSON.stringify(`${text}Attached edit.\n`)})`);
    expect(await tryClose(page)).toBe(true);
    expect(dialogs).toEqual(['beforeunload']);
    await page.mouse.click(5, 5);
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForFunction('!window.__attached.isDirty()');
    expect(await readOpfs(page, 'attached.md.html') === assemble(`${text}Attached edit.\n`, { engineSource: b.iife })).toBe(true);
    expect(await page.evaluate(`${APP}.getText()`)).toBe(`${text}Attached edit.\n`); // while attached, the editor's text is the document
    // destroyed after saving: the page keeps the text the editor saved (never its older copy, which a later page save would
    // write over the editor's work — kit round 5, B3), and Cmd/Ctrl+E is the page's again
    await page.evaluate('window.__attached.destroy()');
    expect(await page.evaluate(`${APP}.getText()`)).toBe(`${text}Attached edit.\n`);
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(false);
    await page.keyboard.press(`${MOD}+e`);
    expect(await page.evaluate(`!!${APP}.editor()`)).toBe(true);
    await ctx.close();
  }, 120_000);
});

chrome('first content, read-view details and editors on a file (real Chrome)', () => {
  it('[R.11] with a CDN that never answers, the document shows at once (the stylesheets do not block the engine); without the engine the article holds one quiet line; the read view switches the stylesheets on', async () => {
    const text = CORPUS.find((c) => c.path === 'md/every-construct.md')!.text;
    const path = files.write('hanging.md.html', await assembleReal(text));
    // every external request hangs (no answer, no error)
    const ctx = await browser!.newContext();
    await ctx.route(/^https?:/, () => { /* never answered */ });
    await ctx.addInitScript(() => {
      const w = window as unknown as { __first?: number };
      new MutationObserver(() => { if (w.__first === undefined && document.querySelector('#orz-doc h1')) w.__first = performance.now(); }).observe(document, { subtree: true, childList: true });
    });
    const page = await ctx.newPage();
    await page.goto(`file://${path}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => (window as unknown as { __first?: number }).__first !== undefined, null, { timeout: 8000 });
    const first = await page.evaluate(() => (window as unknown as { __first: number }).__first);
    expect(first).toBeLessThan(3000); // 1.0 before this fix: 10.7 s behind three hanging stylesheets
    expect(await page.evaluate(() => ['orz-theme', 'orz-katex', 'orz-hljs'].map((id) => document.getElementById(id)?.getAttribute('media') ?? null))).toEqual([null, null, null]);
    expect(await page.locator('#orz-doc .orz-fallback').count()).toBe(0); // the read view replaced the line
    await ctx.close();
    // no engine (scripts off): the one constant line, pointing at the text inside the file
    const off = await browser!.newContext({ javaScriptEnabled: false });
    await off.route(/^https?:/, (r) => r.abort());
    const p2 = await off.newPage();
    await p2.goto(`file://${path}`);
    expect((await p2.locator('#orz-doc').innerText()).trim()).toBe("If this page stays blank, open it in a recent browser; the document's text is inside this file — see the comment at the top.");
    expect(await p2.evaluate(() => document.getElementById('orz-theme')!.getAttribute('media'))).toBe('not all');
    // a cdn file (its engine comes from the web): the line names the connection first
    const cdnPath = files.write('hanging-cdn.md.html', assemble(text, { delivery: 'cdn' }));
    await p2.goto(`file://${cdnPath}`);
    expect((await p2.locator('#orz-doc').innerText()).trim()).toBe("If this page stays blank, check your connection (this page loads its engine from the web) or open it in a recent browser; the document's text is inside this file — see the comment at the top.");
    await off.close();
  }, 60_000);

  it('[R.12] the read view: a newer render wins over a slower older one; the page title, the highlight.js stylesheet and the measure picker follow the header; New document mints a new uid every time', async () => {
    const ctx = await context();
    const text = '{{nyml\nkind: document\ncarrier: md\nuid: doc-readview0000001\ntitle: First title\nmeasure: wide\n}}\n\n# Body\n\n```js\nlet x = 1;\n```\n';
    const page = await openFile(ctx, 'details.md.html', await assembleReal(text));
    expect(await page.title()).toBe('First title');
    // an older render that resolves later does not overwrite a newer one
    const shown = await page.evaluate(async () => {
      const v = (globalThis as unknown as { OrzCarrier: { standalone: { view: { render(t: string, c?: unknown): Promise<void> } } } }).OrzCarrier.standalone.view;
      const slow = v.render('# OLD render\n\n{{md https://example.test/slow.md}}\n', { fetchInclude: () => new Promise((r) => setTimeout(() => r('slow include'), 600)) });
      const fast = v.render('# NEW render\n');
      await Promise.all([slow, fast]);
      return document.getElementById('orz-doc')!.textContent;
    });
    expect(shown).toContain('NEW render');
    expect(shown).not.toContain('OLD render');
    await page.evaluate(`${APP}.view.render(${JSON.stringify(text)})`);
    // the width submenu shows the header's measure as the current choice
    await chooseInHandle(page, 'Width');
    expect(await page.getByRole('menuitemradio', { name: 'Wide', exact: true }).getAttribute('aria-checked')).toBe('true');
    expect(await page.getByRole('menuitemradio', { name: 'Normal', exact: true }).getAttribute('aria-checked')).toBe('false');
    await page.keyboard.press('Escape');
    // a header title edit retitles the page; a dark theme swaps highlight.js to its dark stylesheet (and back)
    await page.evaluate(`${APP}.setSetting({ title: 'Second title' })`);
    await page.waitForFunction(() => document.title === 'Second title');
    const hljs = (): Promise<string | null> => page.evaluate(() => document.getElementById('orz-hljs')!.getAttribute('href'));
    expect(await hljs()).toMatch(/github\.min\.css$/);
    await page.evaluate(`${APP}.setSetting({ theme: 'dark-elegant-1' })`);
    await page.waitForFunction(() => /atom-one-dark/.test(document.getElementById('orz-hljs')!.getAttribute('href') ?? ''));
    expect(await page.evaluate(() => document.querySelector('meta[name="color-scheme"]')!.getAttribute('content'))).toBe('dark');
    await page.evaluate(`${APP}.setSetting({ theme: 'light-academic-1' })`);
    await page.waitForFunction(() => /github\.min\.css$/.test(document.getElementById('orz-hljs')!.getAttribute('href') ?? ''));
    expect(await page.evaluate(() => document.querySelectorAll('link[rel="stylesheet"][id="orz-hljs"]').length)).toBe(1);
    // New document, twice: each a fresh uid
    const uids: string[] = [];
    for (const name of ['new-one.md.html', 'new-two.md.html']) {
      await page.evaluate((n) => { (window as unknown as { __orzPickIn: unknown }).__orzPickIn = { name: n }; }, name);
      expect(await page.evaluate(`${APP}.newDocument()`)).toMatchObject({ ok: true, via: 'file' });
      uids.push(readDocument(extract((await readOpfs(page, name))!)!.text, { kind: 'md' }).meta.uid!);
    }
    expect(uids[0]).toMatch(UID_PATTERN);
    expect(uids[1]).toMatch(UID_PATTERN);
    expect(uids[0]).not.toBe(uids[1]);
    expect(uids).not.toContain('doc-readview0000001');
    await ctx.close();
  }, 60_000);

  it('[X.4] an editor an app mounts on a file with its own hooks.ai (no host AI) gets the AI menu; the reviewed proposal applies', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/minimal.md')!.text;
    const page = await openFile(ctx, 'app-ai.md.html', await assembleReal(text));
    await page.evaluate(`(async () => {
      const el = document.createElement('div'); el.className = 'app-ai-host'; el.style.cssText = 'width: 900px; height: 500px'; document.body.append(el);
      window.__aiEd = globalThis.OrzCarrier.mountEditor(el, { text: ${JSON.stringify(text)}, hooks: { ai: {
        operations: [{ id: 'shout', title: 'Shout', selection: false }],
        request: async (op, ctx) => ({ proposed: ctx.text.toUpperCase() }),
      } } });
      await window.__aiEd.ready;
    })()`);
    const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.app-ai-host, .app-ai-host *')).flatMap((h) => (h.shadowRoot ? Array.from(h.shadowRoot.querySelectorAll('button')).map((x) => x.getAttribute('aria-label') ?? x.textContent ?? '') : [])));
    expect(labels).toContain('AI');
    const r = await page.evaluate(async () => {
      const ed = (window as unknown as { __aiEd: { proposeAi(op: string): Promise<{ ok: boolean; proposal: unknown }>; applyAi(p: unknown): { ok: boolean }; getText(): string; destroy(): void } }).__aiEd;
      const p = await ed.proposeAi('shout');
      const a = ed.applyAi(p.proposal);
      const t = ed.getText();
      ed.destroy();
      return { ok: p.ok && a.ok, t };
    });
    expect(r).toEqual({ ok: true, t: text.toUpperCase() });
    await ctx.close();
  }, 60_000);
});


chrome('round 1 of the carrier-app loop: conflicts, app editors, unresolved includes (real Chrome)', () => {
  const CLI = join(process.cwd(), 'dist', 'cli.js');

  it('[R.13] a file whose text the CLI rewrote on disk (assemble --force) between two browser saves: the save asks — "Replace it" writes the browser\'s text, "Download a copy instead" downloads it and leaves the file; Cmd/Ctrl+S with the focus on the chrome saves the editor', async () => {
    const ctx = await context();
    const dir = tempDir('orz-mdhtml-conflict-');
    const env = { ...process.env, XDG_CACHE_HOME: join(dir.dir, '.cache') };
    const run = (...args: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { cwd: dir.dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: (e as { status: number }).status, out: String((e as { stderr?: string }).stderr ?? '') }; }
    };
    expect(run('new', 'doc.md', '--title', 'Conflict', '--html').code).toBe(0);
    const made = dir.read('doc.md');
    const disk = join(dir.dir, 'doc.md.html');
    const page = await ctx.newPage();
    await page.goto(`file://${disk}`);
    await bootDone(page);
    // the picker's "disk" (OPFS) and the real disk the CLI writes are kept in step by hand
    await writeOpfs(page, 'doc.md.html', readFile(disk, 'utf8'));
    const toDisk = async (): Promise<void> => { writeFile(disk, (await readOpfs(page, 'doc.md.html'))!, 'utf8'); };
    const fromDisk = (): Promise<void> => writeOpfs(page, 'doc.md.html', readFile(disk, 'utf8'));
    const typeAtEnd = async (words: string): Promise<void> => {
      await page.evaluate(`${APP}.editor().focus()`);
      await page.keyboard.press(isMac ? 'Meta+ArrowDown' : 'Control+End');
      await page.keyboard.type(words);
    };

    // the first browser save: written (the picker, once)
    await page.getByRole('button', { name: 'Edit and more', exact: true }).click();
    await page.evaluate(`${APP}.editor().ready`);
    await typeAtEnd('\nBrowser one.');
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForFunction(`!${APP}.isDirty()`);
    expect(extract((await readOpfs(page, 'doc.md.html'))!)!.text).toContain('Browser one.');
    await toDisk();

    // an agent edits the text twin; assemble refuses (the file holds the browser's work), --force rewrites it
    writeFile(join(dir.dir, 'doc.md'), `${made}\nAgent line.\n`, 'utf8');
    const refused = run('assemble', 'doc.md');
    expect(refused.code).toBe(1);
    expect(refused.out).toMatch(/holds a different text than doc\.md/);
    expect(run('assemble', 'doc.md', '--force').code).toBe(0);
    const cliText = extract(readFile(disk, 'utf8'))!.text;
    expect(cliText).toContain('Agent line.');
    await fromDisk();

    // the second browser save — Cmd/Ctrl+S with the focus on the chrome — asks; nothing is written until the answer
    await typeAtEnd(' Browser two.');
    const two = await page.evaluate(`${APP}.editor().getText()`) as string;
    await page.getByRole('button', { name: 'Done', exact: true }).focus();
    await page.keyboard.press(`${MOD}+s`);
    await page.getByText(SAVE_CONFLICT_MESSAGE.slice(0, 40)).waitFor(); // the kit's wording (orz-markdown 2.2.0 round 3)
    expect(extract((await readOpfs(page, 'doc.md.html'))!)!.text).toBe(cliText);
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    await page.getByRole('button', { name: SAVE_CONFLICT_LABELS.replace, exact: true }).click();
    await page.waitForFunction(`!${APP}.isDirty()`);
    expect(await readOpfs(page, 'doc.md.html') === libAssemble(two)).toBe(true);
    expect((await picks(page)).length).toBe(2); // the changed file dropped the session's handle: picked again
    await toDisk();

    // the CLI rewrites it once more; this time the reader downloads a copy and the file keeps the CLI's text
    writeFile(join(dir.dir, 'doc.md'), `${made}\nAgent line.\nAnother agent line.\n`, 'utf8');
    expect(run('assemble', 'doc.md').code).toBe(1);
    expect(run('assemble', 'doc.md', '--force').code).toBe(0);
    const cliText2 = extract(readFile(disk, 'utf8'))!.text;
    await fromDisk();
    await typeAtEnd(' Browser three.');
    const three = await page.evaluate(`${APP}.editor().getText()`) as string;
    const r = await page.evaluate(`${APP}.editor().save()`);
    expect(r).toMatchObject({ ok: false, via: 'file', error: 'conflict', conflict: true });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: SAVE_CONFLICT_LABELS.download, exact: true }).click();
    const d = await download;
    expect(readFile((await d.path())!, 'utf8') === libAssemble(three)).toBe(true);
    expect(extract((await readOpfs(page, 'doc.md.html'))!)!.text).toBe(cliText2);
    dir.clean();
    await ctx.close();
  }, 120_000);

  it('[X.5] an app\'s editor (no hooks.save, a served page): `includes` and a file include\'s path through fetchInclude reach the preview, an unresolved one is a quiet note, refreshPreview({ includes }) brings a new record in; Save goes through the picker under `fileName` (the includes kept in the file), else a download of that name — never the served-page notice', async () => {
    const ctx = await context();
    files.write('app/orz-mdhtml.browser.js', b.iife);
    files.write('app/index.html', '<!doctype html><html><head><meta charset="utf-8"><title>app</title></head><body><div id="ed" style="width:1000px;height:520px"></div><script src="orz-mdhtml.browser.js"></script></body></html>');
    const page = await ctx.newPage();
    const errors = recordErrors(page);
    await page.goto(`${site.url}/app/index.html`);
    await page.waitForFunction(() => !!(globalThis as { OrzCarrier?: unknown }).OrzCarrier);
    const text = '# App doc\n\n{{md parts/a.md}}\n\n{{md parts/b.md}}\n\n{{md parts/c.md}}\n';
    const includes = { 'parts/a.md': 'RECORD-A from includes\n' };
    await page.evaluate(`(async () => {
      window.__asked = [];
      window.__ed = globalThis.OrzCarrier.mountEditor(document.getElementById('ed'), { text: ${JSON.stringify(text)}, mode: 'preview', fileName: 'app-notes.md.html', includes: ${JSON.stringify(includes)}, hooks: {
        fetchInclude: async (t) => { window.__asked.push(t); return t === 'parts/b.md' ? 'PATH-B from fetchInclude\\n' : null; },
      } });
      await window.__ed.ready;
    })()`);
    let frame = null as null | import('playwright-core').Frame;
    for (let i = 0; i < 50 && !frame; i++) {
      for (const f of page.frames()) if (f !== page.mainFrame() && await f.evaluate(() => (document.getElementById('orz-doc')?.textContent ?? '').includes('PATH-B')).catch(() => false)) frame = f;
      if (!frame) await page.waitForTimeout(200);
    }
    expect(frame).not.toBeNull();
    const shown = await frame!.evaluate(() => ({ text: document.getElementById('orz-doc')!.textContent ?? '', missing: Array.from(document.querySelectorAll('#orz-doc p.orz-include-missing')).map((p) => p.textContent) }));
    expect(shown.text).toContain('RECORD-A from includes');
    expect(shown.missing).toEqual(['Included file not available: parts/c.md']);
    const asked = await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);
    expect(asked).toContain('parts/b.md');
    expect(asked).not.toContain('parts/a.md'); // includes first
    // the app resolved parts/c.md: refreshPreview({ includes }) renders with the new record (no note left)
    await page.evaluate(`window.__ed.refreshPreview({ includes: ${JSON.stringify({ ...includes, 'parts/c.md': 'NOW-C from the new record\n' })} })`);
    let refreshed = false;
    for (let i = 0; i < 50 && !refreshed; i++) {
      refreshed = await frame!.evaluate(() => (document.getElementById('orz-doc')?.textContent ?? '').includes('NOW-C') && !document.querySelector('#orz-doc p.orz-include-missing')).catch(() => false);
      if (!refreshed) await page.waitForTimeout(200);
    }
    expect(refreshed).toBe(true);
    // Save: the picker (an app's page is not a served file), the latest refreshed includes go into the file (orz-markdown 2.2.0 round 3)
    const r1 = await page.evaluate(`window.__ed.save()`);
    expect(r1).toMatchObject({ ok: true, via: 'file' });
    const saved = (await readOpfs(page, 'app-notes.md.html'))!; // the fileName option names the save
    expect(extract(saved)!.includes).toEqual({ ...includes, 'parts/c.md': 'NOW-C from the new record\n' });
    expect(saved === assemble(text, { engineSource: b.iife, includes: { ...includes, 'parts/c.md': 'NOW-C from the new record\n' } })).toBe(true);
    // no picker: a download, never the served notice
    await page.evaluate(() => { delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker; });
    await page.evaluate(`window.__ed.setText(${JSON.stringify(`${text}more\n`)})`);
    const download = page.waitForEvent('download');
    const r2 = await page.evaluate(`window.__ed.save()`);
    expect(r2).toMatchObject({ ok: true, via: 'download' });
    expect((await download).suggestedFilename()).toBe('app-notes.md.html');
    expect(readFile((await (await download).path())!, 'utf8') === assemble(`${text}more\n`, { engineSource: b.iife, includes: { ...includes, 'parts/c.md': 'NOW-C from the new record\n' } })).toBe(true);
    const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('*')).flatMap((h) => (h.shadowRoot ? Array.from(h.shadowRoot.querySelectorAll('.orz-toast, #orz-served-note')).map((t) => t.textContent ?? '') : [])).join(' | '));
    expect(toasts).not.toMatch(/web address/);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 60_000);

  it('[R.14] an include nothing resolves is a quiet note in the read view and in the editor\'s preview, its directive kept in data-md', async () => {
    const ctx = await context();
    const text = '# Notes\n\nBefore.\n\n{{md missing-part.md}}\n\nAfter.\n';
    const page = await openFile(ctx, 'missing-include.md.html', await assembleReal(text), { onDisk: false });
    const note = await page.evaluate(() => Array.from(document.querySelectorAll('#orz-doc p.orz-include-missing')).map((p) => ({ text: p.textContent, md: p.getAttribute('data-md') })));
    expect(note).toEqual([{ text: 'Included file not available: missing-part.md', md: '{{md missing-part.md}}' }]);
    await page.evaluate(`${APP}.edit().ready`);
    await page.evaluate(`${APP}.editor().setMode('preview')`);
    let found = false;
    for (let i = 0; i < 50 && !found; i++) {
      for (const f of page.frames()) if (f !== page.mainFrame() && await f.evaluate(() => (document.querySelector('#orz-doc p.orz-include-missing')?.textContent ?? '') === 'Included file not available: missing-part.md').catch(() => false)) found = true;
      if (!found) await page.waitForTimeout(200);
    }
    expect(found).toBe(true);
    await ctx.close();
  }, 60_000);
});

chrome('the handle, the text size and the brand (real Chrome; orz-markdown A.20–A.22)', () => {
  it('[R.15] reading shows one control — the pencil at the bottom-left; hovering lists every operation (Edit, Save, Download a copy, New document, Save as new copy, Theme, Width, Text size); a click edits; the keyboard reaches it first, ArrowUp opens the list, Escape closes it with the focus back, Enter edits; the text size (80–160 %) zooms the article, survives a reload (per uid), leaves the document clean and stays out of the saved file; edit mode shows the orz seal (https://markdown.orz.how) and the orz-mdhtml GitHub link in a new tab, the read view neither', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/minimal.md')!.text;
    const html = await assembleReal(text);
    const page = await openFile(ctx, 'handle.md.html', html);
    const visible = () => page.evaluate(() => {
      const out: string[] = [];
      const walk = (root: Document | ShadowRoot) => {
        for (const el of Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))) if (el.checkVisibility() && el.getBoundingClientRect().width > 0) out.push(el.getAttribute('aria-label') ?? el.textContent ?? '');
        for (const el of Array.from(root.querySelectorAll('*'))) if (el.shadowRoot) walk(el.shadowRoot);
      };
      walk(document);
      return out;
    });
    const pencil = page.getByRole('button', { name: 'Edit and more', exact: true });
    expect(await visible()).toEqual(['Edit and more']);
    const vp = page.viewportSize()!;
    const box = (await pencil.boundingBox())!;
    expect([box.x < 40, vp.height - (box.y + box.height) < 40]).toEqual([true, true]);
    await pencil.hover();
    const list = page.getByRole('menu', { name: 'Edit and more' });
    await list.waitFor();
    const items = await list.evaluate((m) => Array.from(m.children).filter((c) => c.getAttribute('role') !== 'separator').map((c) => (c.querySelector('.orz-handle__label') ?? c.querySelector('.orz-handle__row-label'))?.textContent));
    expect(items).toEqual(['Edit', 'Save', 'Download a copy', 'New document', 'Save as new copy', 'Theme', 'Width', 'Text size']);
    // the text size: the article zooms, the document stays clean
    const h1 = () => page.locator('#orz-doc > :first-child').evaluate((e) => e.getBoundingClientRect().height);
    const before = await h1();
    await page.getByRole('menuitem', { name: 'Larger text' }).click();
    await page.getByRole('menuitem', { name: 'Larger text' }).click();
    expect(await page.getByRole('menuitem', { name: 'Reset text size, now 120%' }).isVisible()).toBe(true);
    expect((await h1()) / before).toBeCloseTo(1.2, 1);
    expect(await page.locator('#orz-doc').evaluate((a) => getComputedStyle(a).zoom)).toBe('1.2');
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(false);
    await page.mouse.move(vp.width / 2, 200);
    await page.waitForTimeout(600);
    expect(await list.count()).toBe(0);
    // per uid, across a reload; never in the saved file
    await page.reload();
    await bootDone(page);
    expect([await page.evaluate(`${APP}.fontScale()`), await page.locator('#orz-doc').evaluate((a) => getComputedStyle(a).zoom)]).toEqual([120, '1.2']);
    await page.evaluate(`${APP}.setSetting({ theme: 'dark-elegant-1' })`);
    expect(await page.evaluate(`${APP}.save()`)).toMatchObject({ ok: true });
    expect((await readOpfs(page, 'handle.md.html')) === assemble(editHeader(text, { theme: 'dark-elegant-1' }), { engineSource: b.iife })).toBe(true);
    await page.evaluate(`${APP}.setFontScale(null)`);
    // the keyboard: Tab reaches the pencil first; ArrowUp opens the list, Escape closes it with the focus back; Enter edits
    const focused = () => page.evaluate(() => { let a: Element | null = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a?.getAttribute('aria-label') ?? a?.textContent?.trim() ?? null; });
    await page.locator('body').click({ position: { x: vp.width - 5, y: 5 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    expect(await focused()).toBe('Edit and more');
    await page.keyboard.press('ArrowUp');
    await list.waitFor();
    expect(await focused()).toBe('Larger text');
    await page.keyboard.press('Escape');
    expect([await list.count(), await focused()]).toEqual([0, 'Edit and more']);
    await page.keyboard.press('Enter');
    await page.waitForFunction(`!!${APP}.editor()`);
    // edit mode: the brand, quiet, at the far end of the bar
    const seal = page.getByRole('link', { name: 'orz-markdown website' });
    const gh = page.getByRole('link', { name: 'orz-mdhtml on GitHub' });
    expect([await seal.isVisible(), await seal.getAttribute('href'), await seal.getAttribute('target'), await seal.getAttribute('rel')]).toEqual([true, 'https://markdown.orz.how', '_blank', 'noopener noreferrer']);
    expect([await gh.isVisible(), await gh.getAttribute('href'), await gh.getAttribute('target'), await gh.getAttribute('rel')]).toEqual([true, 'https://github.com/wangyu16/orz-mdhtml', '_blank', 'noopener noreferrer']);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.waitForFunction(`!${APP}.editor()`);
    expect([await seal.isVisible(), await gh.isVisible()]).toEqual([false, false]);
    // a pointer's click on the pencil edits
    await pencil.click();
    await page.waitForFunction(`!!${APP}.editor()`);
    await ctx.close();
  }, 120_000);
});
