/**
 * Rebuild step 3 — the browser engine and its package (claims W.1–W.6 and
 * A.9 on the real bundle): the bundle rule, one KaTeX, release.json, the
 * `OrzCarrier` surface (FC-19 §2), Node/Chrome parity, the package exports,
 * `renderPreview`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { escapeScriptText } from 'orz-markdown/carrier/read';
import { isScriptSafe, parseManifest, sandboxDocument } from 'orz-markdown/carrier/shell';
import { assemble, extract, readDocument, type AssembleOptions } from '../src/assemble.js';
import { VERSION } from '../src/version.js';
import { BUNDLE_FILE, ESM_FILE, buildBrowser, checkBundleRule, scriptSafe, writeBrowser } from '../build/bundle.js';
import { bundle, launch, routeCdn, serve, tempDir, type Browser, type Page } from './browser-env.js';
import { corpus, HAZARDS } from './helpers.js';

const b = await bundle();
const CORPUS = corpus('md');
const TEXTS: Array<[string, string, Record<string, string> | undefined]> = [
  ...CORPUS.map((c) => [c.path, c.text, c.includes] as [string, string, Record<string, string> | undefined]),
  ...Object.entries(HAZARDS).map(([name, text]) => [`hazard:${name}`, text, undefined] as [string, string, undefined]),
];
const SOME_INCLUDES = { './part.md': 'Included </script> text\r\nwith CR LF and 𝒳\n', 'https://example.test/x.md': '# x\n' };

describe('the bundle and its package (Node)', () => {
  it('[W.1] the bundle rule: no <script / </script (any case, after backslashes), no CR, no NUL; script-safe; escaping leaves it unchanged — IIFE and ESM', () => {
    for (const [name, code] of [[BUNDLE_FILE, b.iife], [ESM_FILE, b.esm]] as const) {
      expect(code.length, name).toBeGreaterThan(100_000);
      expect(/<\\*\/?script/i.test(code), name).toBe(false);
      expect(code.includes('\r'), name).toBe(false);
      expect(code.includes('\u0000'), name).toBe(false);
      expect(isScriptSafe(code), name).toBe(true);
      expect(escapeScriptText(code) === code, name).toBe(true);
      expect(() => checkBundleRule(code, name)).not.toThrow();
      // strict UTF-8 round trip
      expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(code)) === code).toBe(true);
    }
    // the rewrite is what makes it safe: esbuild emits these sequences, and the check refuses them
    expect(scriptSafe('a="</script>";b="<SCRIPT";c="<\\/script"')).toBe('a="\\x3C/script>";b="\\x3CSCRIPT";c="\\x3C\\/script"');
    expect(() => checkBundleRule('a="</script>"', 'x')).toThrow(/script-safe/);
    expect(() => checkBundleRule('a=1;\r\nb=2;', 'x')).toThrow();
    // the build script is the one small copied build file (D-18): it checks after the rewrite and before the integrity
    const src = readFileSync('build/bundle.ts', 'utf8');
    expect(src.indexOf('checkBundleRule(iife')).toBeGreaterThan(src.indexOf('scriptSafe(iifeOut'));
    expect(src.indexOf('sri(iife)')).toBeGreaterThan(src.indexOf('checkBundleRule(iife'));
  });

  it('[W.2] one KaTeX in the bundle (katex and katex/contrib/mhchem resolve to one build)', () => {
    for (const code of [b.iife, b.esm]) {
      expect(code.split('KaTeX parse error').length - 1).toBe(1);
      expect(code).toContain('\\ce'); // mhchem is in
    }
  });

  it('[W.3] release.json: a valid manifest of this release whose integrity is the SHA-384 of the bundle\'s exact bytes', async () => {
    const raw = JSON.parse(b.release) as Record<string, unknown>;
    const m = parseManifest(raw, 'md');
    expect(m).not.toBeNull();
    expect(raw).toEqual({
      kind: 'md', version: VERSION, formats: [1],
      notes: `https://github.com/wangyu16/orz-mdhtml/blob/main/CHANGELOG.md#${VERSION.replace(/\./g, '')}`,
      bundle: { path: BUNDLE_FILE, integrity: `sha384-${createHash('sha384').update(Buffer.from(b.iife, 'utf8')).digest('base64')}` },
    });
    expect(b.release.endsWith('\n')).toBe(true);
    // written files: the same bytes and the same integrity
    const t = tempDir();
    try {
      const paths = writeBrowser(b, t.dir);
      const bytes = readFileSync(paths.bundle);
      expect(bytes.equals(Buffer.from(b.iife, 'utf8'))).toBe(true);
      const written = JSON.parse(readFileSync(paths.release, 'utf8')) as { bundle: { integrity: string } };
      expect(written.bundle.integrity).toBe(`sha384-${createHash('sha384').update(bytes).digest('base64')}`);
      expect(readFileSync(paths.esm, 'utf8') === b.esm).toBe(true);
    } finally {
      t.clean();
    }
    // a build of another version writes that version everywhere (the conformance harness's `next`)
    const next = await buildBrowser({ version: '9.9.9' });
    expect(JSON.parse(next.release)).toMatchObject({ version: '9.9.9' });
    expect(next.iife).toContain('"9.9.9"');
  });

  it('[W.5] the package: exports (import → ESM, default → IIFE), files, types and version in lockstep', () => {
    const pkg = JSON.parse(readFileSync('browser/package.json', 'utf8')) as { name: string; version: string; main: string; exports: Record<string, unknown>; files: string[]; types: string };
    const root = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(pkg.name).toBe('orz-mdhtml-browser');
    expect(pkg.version).toBe(root.version);
    expect(pkg.main).toBe(BUNDLE_FILE);
    expect(pkg.exports['.']).toEqual({ types: './index.d.ts', import: `./${ESM_FILE}`, default: `./${BUNDLE_FILE}` });
    expect(pkg.exports['./release.json']).toBe('./release.json');
    expect(pkg.files).toEqual(expect.arrayContaining([BUNDLE_FILE, ESM_FILE, 'release.json', 'index.d.ts', 'README.md']));
    // every runtime export of the ESM build is declared in index.d.ts
    const exported = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(b.esm)![1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!).filter(Boolean).sort();
    expect(exported).toEqual(['DEFAULT_THEME', 'MEASURES', 'OrzCarrier', 'THEMES', 'assemble', 'editHeader', 'extract', 'formats', 'kind', 'mountEditor', 'readDocument', 'renderPreview', 'version']);
    const dts = readFileSync('browser/index.d.ts', 'utf8');
    for (const name of exported) expect(dts, name).toMatch(new RegExp(`export declare (const|function) ${name}\\b`));
  });
});

const browser: Browser | null = await launch();
afterAll(async () => { await browser?.close(); });
const chrome = browser ? describe : describe.skip;

/** A blank page with the IIFE loaded inline (as in an inline file). */
const site = await serve(process.cwd(), { '/blank.html': { body: '<!doctype html><html><body></body></html>' } });
afterAll(async () => { await site.close(); });

/** A blank served page with the IIFE loaded inline (as in an inline file). */
async function bundlePage(): Promise<Page> {
  const ctx = await browser!.newContext();
  await routeCdn(ctx);
  const page = await ctx.newPage();
  await page.goto(`${site.url}/blank.html`);
  await page.addScriptTag({ content: b.iife });
  return page;
}

type Carrier = { kind: string; version: string; formats: number[]; assemble(t: string, o?: unknown): Promise<string>; extract(h: string): unknown; readDocument(t: string): unknown; mountEditor: unknown; renderPreview(t: string, o?: unknown): Promise<string>; standalone?: unknown };

chrome('real Chrome (playwright-core, channel chrome)', () => {
  it('[W.4] globalThis.OrzCarrier per FC-19 §2; extract/readDocument agree with the kit; nothing booted outside a file', async () => {
    const page = await bundlePage();
    const text = CORPUS.find((c) => c.path === 'md/every-construct.md')!.text;
    const html = assemble(text, { delivery: 'cdn' });
    const r = await page.evaluate(async ({ text, html }) => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      const p = C.assemble(text, { delivery: 'cdn' });
      return {
        keys: Object.keys(C).sort(),
        kind: C.kind, version: C.version, formats: C.formats,
        types: ['assemble', 'extract', 'readDocument', 'mountEditor', 'renderPreview'].map((k) => typeof (C as unknown as Record<string, unknown>)[k]),
        promise: p instanceof Promise, html: await p,
        extracted: C.extract(html), info: C.readDocument(text), standalone: C.standalone,
        storage: Object.keys(localStorage), chrome: !!document.getElementById('orz-chrome'),
      };
    }, { text, html });
    expect(r.keys).toEqual(['assemble', 'extract', 'formats', 'kind', 'mountEditor', 'readDocument', 'renderPreview', 'standalone', 'version']);
    expect(r).toMatchObject({ kind: 'md', version: VERSION, formats: [1], promise: true, standalone: null, storage: [], chrome: false });
    expect(r.types).toEqual(['function', 'function', 'function', 'function', 'function']);
    expect(r.html === html).toBe(true);
    expect(r.extracted).toEqual(extract(html));
    expect(r.info).toEqual(JSON.parse(JSON.stringify(readDocument(text, { kind: 'md' }))));
    // refusals reject (a Promise API never throws synchronously)
    const refused = await page.evaluate(async () => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      const out: string[] = [];
      for (const [t, o] of [['a\u0000b', { delivery: 'cdn' }], ['{{nyml\nkind: document\nformat: 2\n}}\n', { delivery: 'cdn' }], ['x', { delivery: 'zip' }], ['x', { engineSource: '"</script>"' }]] as const) {
        try { await C.assemble(t, o); out.push('resolved'); } catch (e) { out.push(String((e as Error).message)); }
      }
      return out;
    });
    expect(refused[0]).toMatch(/NUL/);
    expect(refused[1]).toMatch(/format 2/);
    expect(refused[2]).toMatch(/unknown delivery/);
    expect(refused[3]).toMatch(/script-safe/);
    await page.context().close();
  });

  it('[W.4] the bundle alone assembles in a sandbox="allow-scripts" frame (the quiet update\'s sandbox) and writes the Node bytes', async () => {
    const ctx = await browser!.newContext();
    const page = await ctx.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const text = CORPUS.find((c) => c.path === 'md/includes.md')!;
    const out = await page.evaluate(async ({ srcdoc, text, includes, bundleText }) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.srcdoc = srcdoc;
      const results: Array<{ ok: boolean; html?: string; version?: string; error?: string }> = [];
      await new Promise<void>((resolve) => {
        let n = 0;
        addEventListener('message', (e) => {
          if (e.source !== f.contentWindow) return;
          const d = e.data as { type: string; ok: boolean; html?: string; version?: string; error?: string };
          if (d.type === 'orz-reassemble-ready') {
            f.contentWindow!.postMessage({ type: 'orz-reassemble', id: 'a', text, delivery: 'inline', engineSource: bundleText, includes }, '*');
            f.contentWindow!.postMessage({ type: 'orz-reassemble', id: 'b', text, delivery: 'inline', includes }, '*'); // no engineSource: the bundle's own text
            f.contentWindow!.postMessage({ type: 'orz-reassemble', id: 'c', text, delivery: 'cdn' }, '*');
          } else if (d.type === 'orz-reassembled') { results.push(d); if (++n === 3) resolve(); }
        });
        document.body.append(f);
      });
      return results;
    }, { srcdoc: sandboxDocument(b.iife), text: text.text, includes: text.includes, bundleText: b.iife });
    expect(out.map((r) => r.ok)).toEqual([true, true, true]);
    const inline = assemble(text.text, { engineSource: b.iife, includes: text.includes });
    expect(out[0].html === inline).toBe(true);
    expect(out[2].html === assemble(text.text, { delivery: 'cdn' })).toBe(true);
    // without engineSource the bundle inlines its own script text (the sandbox writes it with a final line break)
    expect(extract(out[1].html!)).toMatchObject({ text: text.text, shell: VERSION, delivery: 'inline', includes: text.includes });
    expect(out[1].html!).toContain(b.iife);
    expect(out.every((r) => r.version === VERSION)).toBe(true);
    await ctx.close();
  });

  it('[A.9] browser parity: the real bundle\'s OrzCarrier.assemble in Chrome writes the Node bytes for every md corpus file and hazard text (inline with the bundle given and defaulted, cdn, with and without includes)', async () => {
    const page = await bundlePage();
    const sets: Array<[string, AssembleOptions]> = [['inline', {}], ['cdn', { delivery: 'cdn' }], ['inline+includes', { includes: SOME_INCLUDES }], ['cdn+includes', { delivery: 'cdn', includes: SOME_INCLUDES }]];
    const cases = TEXTS.flatMap(([id, text, own]) => sets.map(([name, o]) => ({ id: `${id} ${name}`, text, opts: own ? { ...o, includes: own } : o })));
    const fromChrome = await page.evaluate(async (cs) => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      const out: string[] = [];
      for (const c of cs) out.push(await C.assemble(c.text, c.opts));
      return out;
    }, cases);
    cases.forEach((c, i) => {
      const node = assemble(c.text, (c.opts.delivery ?? 'inline') === 'inline' ? { ...c.opts, engineSource: b.iife } : c.opts);
      expect(fromChrome[i] === node, c.id).toBe(true);
    });
    // and with an explicit engineSource (the update's path)
    const given = await page.evaluate(async ({ t, e }) => (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier.assemble(t, { engineSource: e }), { t: TEXTS[0][1], e: 'window.x=1;' });
    expect(given === assemble(TEXTS[0][1], { engineSource: 'window.x=1;' })).toBe(true);
    await page.context().close();
  }, 180_000);

  it('[W.2] \\ce{H2O} renders through the bundle (mhchem on the KaTeX that renders)', async () => {
    const page = await bundlePage();
    const html = await page.evaluate(() => (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier.renderPreview('Water: $\\ce{H2O}$ and $\\ce{CO2 + C -> 2 CO}$\n'));
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-error');
    expect(html).toMatch(/<msub>/); // the subscript of H2O is typeset (an unknown \ce would be a katex-error)
    await page.context().close();
  });

  it('[W.6] renderPreview: the article HTML (twin links, includes from a record or the app), or a script-free document with the header\'s theme', async () => {
    const page = await bundlePage();
    const text = '{{nyml\nkind: document\ntitle: Pre view\ntheme: dark-elegant-1\nmeasure: wide\n}}\n\n# Heading\n\nSee [next](next.md).\n\n{{md parts/a.md}}\n\n{{md https://example.test/b.md}}\n';
    const r = await page.evaluate(async (text) => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      return {
        plain: await C.renderPreview(text),
        rec: await C.renderPreview(text, { includes: { 'parts/a.md': 'FILE-INCLUDED\n', 'https://example.test/b.md': 'URL-INCLUDED\n' } }),
        app: await C.renderPreview(text, { fetchInclude: async (u: string) => (u === 'https://example.test/b.md' ? 'APP-INCLUDED\n' : null), twinLinks: false }),
        doc: await C.renderPreview(text, { document: true }),
      };
    }, text);
    expect(r.plain).toContain('href="next.md.html"');
    expect(r.plain).not.toContain('INCLUDED');
    expect(r.rec).toContain('FILE-INCLUDED');
    expect(r.rec).toContain('URL-INCLUDED');
    expect(r.app).toContain('APP-INCLUDED');
    expect(r.app).toContain('href="next.md"');
    expect(r.doc.startsWith('<!doctype html>')).toBe(true);
    expect(r.doc).toContain('themes/dark-elegant-1.css');
    expect(r.doc).toContain('<article class="markdown-body measure-wide">');
    expect(r.doc).toContain('<title>Pre view</title>');
    expect(/<script/i.test(r.doc)).toBe(false);
    await page.context().close();
  });
});

