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
import { assemble } from '../src/assemble.js';
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
    expect(r.body.slice(0, 4)).toEqual(['script#orz-src', 'main#orz-view', 'div#orz-chrome', 'script#orz-engine']);
    expect(r.sheets).toEqual(['orz-theme', 'orz-katex', 'orz-hljs']);
    expect(r.lightButtons).toBe(0);
    expect(r.shadow).toBe(true);
    expect(r.buttons).toEqual(['Edit', 'Theme', 'Measure', 'Save', 'Done', 'More']); // Done shows in edit mode only
    await ctx.close();
  });
});

chrome('edit, settings and saves (real Chrome)', () => {
  it('[R.3] Edit → type → Save writes exactly assemble(text) through the picker (never the live DOM); the second save reuses the handle; the file reopens with the text', async () => {
    const ctx = await context();
    const text = CORPUS.find((c) => c.path === 'md/minimal.md')!.text;
    const html = await assembleReal(text);
    const page = await openFile(ctx, 'typed.md.html', html);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
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
    expect(toast).toMatch(/served from the web.*Download a copy/);
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
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    await page.getByRole('menuitemradio', { name: nocturne.name, exact: true }).click();
    let t = await page.evaluate(`${APP}.getText()`) as string;
    expect(t).toBe(editHeader(text, { theme: 'dark-elegant-3' }));
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    expect(await page.locator('#orz-theme').getAttribute('href')).toBe(themeHref('dark-elegant-3'));
    await page.getByRole('button', { name: 'Measure', exact: true }).click();
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
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
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
    expect(await page.locator('#orz-theme').getAttribute('href')).toBe(themeHref('light-academic-1'));
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

  it('[R.8] the quiet update: a newer release shows the indicator next to the brand; Update now writes the new release\'s assembly of the exact text into the opened file and reloads', async () => {
    const next = await bundle('9.9.9');
    const log: string[] = [];
    const ctx = await context({ latest: { release: next.release, bundle: next.iife, version: '9.9.9' }, log });
    const text = CORPUS.find((c) => c.path === 'md/crlf.md')!.text;
    const html = await assembleReal(text);
    const page = await openFile(ctx, 'update-me.md.html', html);
    const indicator = page.getByRole('button', { name: 'Update available: 9.9.9' });
    await indicator.waitFor();
    await indicator.click();
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Update now' }).click();
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
    await typed.getByRole('button', { name: 'Edit', exact: true }).click();
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
    const indicator = page.getByRole('button', { name: 'Update available: 9.9.9' });
    await indicator.waitFor();
    await indicator.click();
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Update now' }).click();
    await reloaded;
    expect(updateDialogs).toEqual([]);
    const written = extract((await readOpfs(page, 'leave-update.md.html'))!)!;
    expect(written.text === current).toBe(true);
    expect(written.shell).toBe('9.9.9');
    await uctx.close();
  }, 120_000);

  it('[R.10] an editor mounted on the file (OrzCarrier.mountEditor, no hooks.save) is the document being edited: Cmd/Ctrl+S on the page or in it saves it (a newer-format one is read-only — it may take the focus — and writes nothing), never the page\'s other copy; its unsaved changes ask before leaving; destroyed, the page\'s text and keys are its own again', async () => {
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
    // destroyed: the page's own copy of the text (never saved over the editor's) and Cmd/Ctrl+E are the page's again
    await page.evaluate('window.__attached.destroy()');
    expect(await page.evaluate(`${APP}.getText()`)).toBe(text);
    await page.keyboard.press(`${MOD}+e`);
    expect(await page.evaluate(`!!${APP}.editor()`)).toBe(true);
    await ctx.close();
  }, 120_000);
});
