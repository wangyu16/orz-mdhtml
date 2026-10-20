/**
 * Rebuild step 3 — the browser engine and its package (claims W.1–W.6 and
 * A.9 on the real bundle): the bundle rule, one KaTeX, release.json, the
 * `OrzCarrier` surface (FC-19 §2), Node/Chrome parity, the package exports,
 * `renderPreview`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { escapeScriptText } from 'orz-markdown/carrier/read';
import { renderMarkdownPreviewWithIncludes } from 'orz-markdown/carrier/editor';
import { isScriptSafe, parseManifest, sandboxDocument } from 'orz-markdown/carrier/shell';
import { assemble, extract, readDocument, type AssembleOptions } from '../src/assemble.js';
import { VERSION } from '../src/version.js';
import { BUNDLE_FILE, ESM_FILE, asciiOnly, buildBrowser, checkBundleRule, scriptSafe, writeBrowser } from '../build/bundle.js';
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
      // strict UTF-8 round trip, and pure ASCII (charset: 'ascii' and the escape of what it leaves): the bytes are the text under any charset
      expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(code)) === code).toBe(true);
      expect(/[^\x00-\x7f]/.test(code), name).toBe(false);
      expect(Buffer.byteLength(code, 'utf8'), name).toBe(code.length);
    }
    // the rewrite is what makes it safe: esbuild emits these sequences, and the check refuses them
    expect(scriptSafe('a="</script>";b="<SCRIPT";c="<\\/script"')).toBe('a="\\x3C/script>";b="\\x3CSCRIPT";c="\\x3C\\/script"');
    expect(() => checkBundleRule('a="</script>"', 'x')).toThrow(/script-safe/);
    expect(() => checkBundleRule('a=1;\r\nb=2;', 'x')).toThrow();
    expect(() => checkBundleRule('a=/[\u00e9]/;', 'x')).toThrow(/ASCII/);
    // what charset: 'ascii' leaves (regular expression literals) is escaped to the same characters
    expect(asciiOnly('a=/[îï]/u.test(s)||"𝒳"')).toBe('a=/[\\u00ee\\u00ef]/u.test(s)||"\\ud835\\udcb3"');
    // eslint-disable-next-line no-new-func
    expect(new Function(`return ${asciiOnly('/^[ñ𝒳]+$/u')}`)().test('ñ𝒳ñ')).toBe(true);
    // the build script is the one small copied build file (D-18): it checks after the rewrite and before the integrity
    const src = readFileSync('build/bundle.ts', 'utf8');
    expect(src.indexOf('scriptSafe(asciiOnly(iifeOut')).toBeGreaterThan(0);
    expect(src.indexOf('checkBundleRule(iife')).toBeGreaterThan(src.indexOf('scriptSafe(asciiOnly(iifeOut'));
    expect(src.indexOf('sri(iife)')).toBeGreaterThan(src.indexOf('checkBundleRule(iife'));
  });

  it('[L.1] the standalone startup is the kit\'s carrier/app: the entry captures its engine source, then startCarrier(MD_KIND); no copy of the app here; MD_KIND is the md side of the seam', () => {
    for (const gone of ['src/browser/standalone', 'src/browser/ui', 'src/browser/engine-source.ts', 'tests/seam.test.ts']) expect(existsSync(gone), gone).toBe(false);
    const entry = readFileSync('src/browser/index.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(entry).toMatch(/from 'orz-markdown\/carrier\/app'/);
    // only this carrier's bundle is the engine (orz-markdown A.12): the bundle's file name is given
    const capture = 'captureEngineSource(undefined, { bundle: BUNDLE_FILE })';
    expect(entry.indexOf(capture)).toBeGreaterThan(0);
    expect(entry.indexOf('startCarrier(MD_KIND)')).toBeGreaterThan(entry.indexOf(capture));
    const kind = readFileSync('src/browser/md/kind.ts', 'utf8');
    for (const member of ['readDocument', 'renderPreview', 'extract', 'createReadView', 'settings: MD_SETTINGS']) expect(kind, member).toContain(member);
    expect(kind).not.toMatch(/refreshEditorTools|editorInternals/);
    // the md editor uses the kit's widgets and renderer, no local copies
    const carrier = readFileSync('src/browser/carrier.ts', 'utf8');
    for (const k of ['attachSettings(shell, MD_SETTINGS', 'followPresentation(shell', 'render: renderMarkdownPreviewWithIncludes,']) expect(carrier, k).toContain(k);
    expect(carrier).not.toMatch(/reviewProposal|menuButton|<style>/);
    // the read view uses the kit's stylesheet swap and releases its enhancement (orz-markdown M.26, M.27)
    const view = readFileSync('src/browser/md/read-view.ts', 'utf8');
    for (const k of ["swapStylesheet(doc, 'orz-theme',", "swapStylesheet(doc, 'orz-hljs',", 'disposeEnhancement(article!); // the old content', 'destroy() {']) expect(view, k).toContain(k);
    expect(view).not.toMatch(/const swap = |data-orz-leaving/);
  });

  it('[L.2] the kit resolves the URL includes of a text with a file include when no include record is given (orz-markdown 14cc3bc; the local workaround is gone)', async () => {
    const text = '# H\n\n{{md parts/a.md}}\n\n{{md https://example.test/b.md}}\n';
    const fetchInclude = async (u: string): Promise<string | null> => (u === 'https://example.test/b.md' ? 'APP-INCLUDED\n' : null);
    expect(await renderMarkdownPreviewWithIncludes(text, { fetchInclude })).toContain('APP-INCLUDED');
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
    expect(pkg.exports['.']).toEqual({ types: './index.d.ts', import: `./${ESM_FILE}`, require: './require.cjs', default: `./${BUNDLE_FILE}` });
    expect(pkg.exports['./release.json']).toBe('./release.json');
    expect(pkg.files).toEqual(expect.arrayContaining([BUNDLE_FILE, ESM_FILE, 'release.json', 'index.d.ts', 'README.md', 'require.cjs', 'docs/embedding.md']));
    // the app author's guide ships in both packages (the build copies it into browser/docs/)
    expect((JSON.parse(readFileSync('package.json', 'utf8')) as { files: string[] }).files).toContain('docs/embedding.md');
    expect(readFileSync('browser/docs/embedding.md', 'utf8')).toBe(readFileSync('docs/embedding.md', 'utf8'));
    // every runtime export of the ESM build is declared in index.d.ts
    const exported = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(b.esm)![1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!).filter(Boolean).sort();
    expect(exported).toEqual(['DEFAULT_THEME', 'MEASURES', 'OrzCarrier', 'THEMES', 'assemble', 'editHeader', 'extract', 'formats', 'kind', 'mountEditor', 'readDocument', 'renderPreview', 'version']);
    const dts = readFileSync('browser/index.d.ts', 'utf8');
    for (const name of exported) expect(dts, name).toMatch(new RegExp(`export declare (const|function) ${name}\\b`));
    // the IIFE global's booted-file handle is typed too
    expect(dts).toMatch(/interface OrzCarrierApi \{[^}]*readonly standalone\?: StandaloneFile \| null;/);
    expect(dts).toMatch(/export interface StandaloneFile \{/);
  });

  it('[W.7] publishing safety: prepublishOnly refuses a release.json that does not match the files (version, integrity), require() gets a clear error', () => {
    const pkg = JSON.parse(readFileSync('browser/package.json', 'utf8')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.prepublishOnly).toBe('node scripts/check-release.mjs && cd .. && npx tsx scripts/release-check.ts && npx tsx scripts/test-release.ts --check');
    const run = (dir: string): { status: number | null; out: string } => {
      const r = spawnSync(process.execPath, [join(dir, 'scripts', 'check-release.mjs')], { encoding: 'utf8' });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };
    // the real package passes
    expect(run('browser')).toMatchObject({ status: 0 });
    // a copy with a stale integrity, another version, or a changed bundle is refused
    const t = tempDir('orz-mdhtml-publish-');
    try {
      const pkgDir = join(t.dir, 'browser');
      cpSync('browser', pkgDir, { recursive: true });
      const release = JSON.parse(readFileSync(join(pkgDir, 'release.json'), 'utf8')) as { version: string; bundle: { integrity: string } };
      writeFileSync(join(pkgDir, 'orz-mdhtml.browser.js'), `${b.iife};`, 'utf8');
      expect(run(pkgDir)).toMatchObject({ status: 1, out: expect.stringMatching(/integrity is not the SHA-384/) });
      writeFileSync(join(pkgDir, 'orz-mdhtml.browser.js'), b.iife, 'utf8');
      writeFileSync(join(pkgDir, 'release.json'), JSON.stringify({ ...release, version: '0.0.1' }), 'utf8');
      expect(run(pkgDir)).toMatchObject({ status: 1, out: expect.stringMatching(/release\.json says version 0\.0\.1/) });
    } finally { t.clean(); }
    // require() is not silently an empty object (the IIFE): it throws, naming import and <script>
    expect(() => createRequire(import.meta.url)('../browser/require.cjs')).toThrow(/require\(\) is not supported.*import.*<script/);
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
    // without engineSource the bundle inlines its own script text: the sandbox holds exactly the verified bytes, so the file is the Node one
    expect(extract(out[1].html!)).toMatchObject({ text: text.text, shell: VERSION, delivery: 'inline', includes: text.includes });
    expect(out[1].html === inline).toBe(true);
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

  it('[A.9] browser parity with a newer installed kit: dist/lib.js, run where orz-markdown/version says 9.9.9, writes the bytes of the bundle\'s OrzCarrier.assemble (inline and cdn; no theme URL names the installed kit)', async () => {
    const t = tempDir('orz-mdhtml-newer-kit-');
    try {
      // a resolve hook: the installed orz-markdown reports a newer version (what a `^` range resolves after a kit release)
      const hook = `export async function resolve(s, c, n) { if (s === 'orz-markdown/version') return { url: 'data:text/javascript,export const VERSION = "9.9.9";', shortCircuit: true }; return n(s, c); }`;
      t.write('register.mjs', `import { register } from 'node:module';\nregister(${JSON.stringify(`data:text/javascript,${encodeURIComponent(hook)}`)});\n`);
      const texts = [TEXTS[0][1], '{{nyml\nkind: document\ntitle: T\ntheme: dark-elegant-1\nmeasure: wide\n}}\n\n# Hi\n\ntext\n'];
      t.write('run.mjs', `import { VERSION as KIT } from 'orz-markdown/version';\nimport * as M from ${JSON.stringify(new URL(`file://${join(process.cwd(), 'dist/lib.js')}`).href)};\nconst texts = ${JSON.stringify(texts)};\nprocess.stdout.write(JSON.stringify({ kit: KIT, lib: M.ORZ_MARKDOWN_VERSION, out: texts.flatMap((x) => [M.assemble(x), M.assemble(x, { delivery: 'cdn' })]) }));\n`);
      const r = spawnSync(process.execPath, ['--import', join(t.dir, 'register.mjs'), join(t.dir, 'run.mjs')], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      expect(r.status, r.stderr).toBe(0);
      const child = JSON.parse(r.stdout) as { kit: string; lib: string; out: string[] };
      expect(child.kit).toBe('9.9.9'); // the simulation took effect
      expect(child.lib).not.toBe('9.9.9');
      expect(child.out.some((h) => h.includes('orz-markdown@9.9.9'))).toBe(false);
      const page = await bundlePage();
      const fromChrome = await page.evaluate(async (xs) => {
        const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
        const out: string[] = [];
        for (const x of xs) out.push(await C.assemble(x), await C.assemble(x, { delivery: 'cdn' }));
        return out;
      }, texts);
      fromChrome.forEach((h, i) => expect(child.out[i] === h, `case ${i}`).toBe(true));
      await page.context().close();
    } finally {
      t.clean();
    }
  }, 120_000);

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
    const text = '{{nyml\nkind: document\ntitle: Pre view <b> & "q"\ntheme: dark-elegant-1\nmeasure: wide\n}}\n\n# Heading\n\nSee [next](next.md).\n\n{{md parts/a.md}}\n\n{{md https://example.test/b.md}}\n';
    const r = await page.evaluate(async (text) => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      return {
        plain: await C.renderPreview(text),
        rec: await C.renderPreview(text, { includes: { 'parts/a.md': 'FILE-INCLUDED\n', 'https://example.test/b.md': 'URL-INCLUDED\n' } }),
        app: await C.renderPreview(text, { fetchInclude: async (u: string) => (u === 'https://example.test/b.md' ? 'APP-INCLUDED\n' : null), twinLinks: false }),
        // a file include the record lacks goes to fetchInclude with its path as written (FC-19 §3, 2.2.0)
        path: await C.renderPreview(text, { includes: { 'https://example.test/b.md': 'URL-INCLUDED\n' }, fetchInclude: async (u: string) => (u === 'parts/a.md' ? 'PATH-INCLUDED\n' : null) }),
        doc: await C.renderPreview(text, { document: true }),
      };
    }, text);
    expect(r.plain).toContain('href="next.md.html"');
    expect(r.plain).not.toContain('INCLUDED');
    // an include nothing resolves is a quiet note, the directive kept (orz-markdown E.30)
    expect(r.plain).toContain('<p class="orz-include-missing" role="note" data-md="{{md parts/a.md}}"><small>Included file not available: parts/a.md</small></p>');
    expect(r.path).toContain('PATH-INCLUDED');
    expect(r.path).toContain('URL-INCLUDED');
    expect(r.path).not.toContain('orz-include-missing');
    expect(r.rec).toContain('FILE-INCLUDED');
    expect(r.rec).toContain('URL-INCLUDED');
    expect(r.app).toContain('APP-INCLUDED');
    expect(r.app).toContain('href="next.md"');
    expect(r.doc.startsWith('<!doctype html>')).toBe(true);
    expect(r.doc).toContain('themes/dark-elegant-1.css');
    expect(r.doc).toContain('<article class="markdown-body measure-wide">');
    expect(r.doc).toContain('<title>Pre view &lt;b&gt; &amp; &quot;q&quot;</title>'); // the title is escaped
    expect(/<script/i.test(r.doc)).toBe(false);
    expect(r.doc).not.toContain('media="not all"'); // a script-free document: its stylesheets are on
    await page.context().close();
  });
});

