/**
 * The isomorphic assembler (src/assemble.ts) against the FC-18 laws on the
 * shared golden corpus and hazard texts (claims A.1–A.10; A.9, Chrome
 * parity with the real bundle, is in bundle.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as kit from 'orz-markdown/carrier';
import { bundleUrl } from 'orz-markdown/carrier/shell';
import { assemble, extract, readDocument, shellParts, cdnBundleUrl, BUNDLE_FILE, type AssembleOptions } from '../src/assemble.js';
import { VERSION } from '../src/version.js';
import { presentationOf } from '../src/presentation.js';
import { DEFAULT_THEME, themeOf } from '../src/themes.js';
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';
import { corpus, HAZARDS, ENGINE } from './helpers.js';

const CORPUS = corpus('md');
const TEXTS: Array<[string, string, Record<string, string> | undefined]> = [
  ...CORPUS.map((c) => [c.path, c.text, c.includes] as [string, string, Record<string, string> | undefined]),
  ...Object.entries(HAZARDS).map(([name, text]) => [`hazard:${name}`, text, undefined] as [string, string, undefined]),
];
const SOME_INCLUDES = { './part.md': 'Included </script> text\r\nwith CR LF and 𝒳\n', 'https://example.test/x.md': '# x\n' };
const OPTION_SETS: Array<[string, AssembleOptions]> = [
  ['inline', { engineSource: ENGINE }],
  ['cdn', { delivery: 'cdn' }],
  ['inline+includes', { engineSource: ENGINE, includes: SOME_INCLUDES }],
  ['cdn+includes', { delivery: 'cdn', includes: SOME_INCLUDES }],
];
const withOwn = (o: AssembleOptions, own: Record<string, string> | undefined): AssembleOptions => (own ? { ...o, includes: own } : o);

describe('FC-18 laws', () => {
  it('[A.1] the corpus is the md corpus of the orz-markdown package, byte-sensitive files included', () => {
    expect(CORPUS.map((c) => c.path)).toEqual(expect.arrayContaining(['md/crlf.md', 'md/bom.md', 'md/script-close.md', 'md/unicode.md', 'md/includes.md', 'md/large.md']));
    expect(CORPUS.find((c) => c.path === 'md/bom.md')!.text.charCodeAt(0)).toBe(0xfeff);
    expect(CORPUS.find((c) => c.path === 'md/crlf.md')!.text).toContain('\r\n');
  });

  for (const [name, o] of OPTION_SETS) {
    it(`[A.1] round trip, ${name}: extract(assemble(T)).text === T for every md corpus file and hazard text`, () => {
      for (const [id, text, own] of TEXTS) {
        const html = assemble(text, withOwn(o, own));
        const ex = extract(html);
        expect(ex, id).not.toBeNull();
        expect(ex!.text === text, id).toBe(true);
        expect(ex!.kind, id).toBe('md');
        expect(ex!.shell, id).toBe(VERSION);
        expect(ex!.delivery, id).toBe(o.delivery ?? 'inline');
        expect(ex!.includes, id).toEqual(own ?? o.includes);
      }
    });
  }

  it('[A.2] determinism: the same bytes on every call and after a fresh module load', async () => {
    const first = TEXTS.map(([, t, own]) => OPTION_SETS.map(([, o]) => assemble(t, withOwn(o, own))));
    const again = TEXTS.map(([, t, own]) => OPTION_SETS.map(([, o]) => assemble(t, withOwn(o, own))));
    expect(again).toEqual(first);
    vi.resetModules();
    const fresh = await import('../src/assemble.js');
    expect(fresh.assemble).not.toBe(assemble); // a new module instance
    const third = TEXTS.map(([, t, own]) => OPTION_SETS.map(([, o]) => fresh.assemble(t, withOwn(o, own))));
    expect(third).toEqual(first);
  });

  it('[A.2] the assembler modules read no clock, randomness or environment', () => {
    for (const file of ['src/assemble.ts', 'src/presentation.ts', 'src/inspect.ts', 'src/legacy.ts', 'src/themes.ts', 'src/version.ts']) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\bDate\b|Math\.random|\bprocess\b|\bnavigator\b|\blocation\b|performance\.now|crypto\./);
    }
  });

  it('[A.3] idempotence: assemble(extract(F).text, o) === F', () => {
    for (const [id, text, own] of TEXTS) {
      for (const [, o] of OPTION_SETS) {
        const opts = withOwn(o, own);
        const f = assemble(text, opts);
        expect(assemble(extract(f)!.text, opts) === f, id).toBe(true);
        // and with the includes the file carries (what a browser re-assembly passes)
        expect(assemble(extract(f)!.text, { ...opts, includes: extract(f)!.includes }) === f, id).toBe(true);
      }
    }
  });

  it('[A.4] content independence: the shell parts depend only on the options and the header\'s theme and measure; the document parts not on the delivery', () => {
    const headPart = (html: string): string => /id="orz-shell">[^<]*<\/script>\n([\s\S]*?)\n<\/head>/.exec(html)![1];
    const tail = (html: string): string => {
      const island = html.indexOf('id="orz-src"');
      let end = html.indexOf('</script>', island) + '</script>'.length;
      if (html.startsWith('\n<script type="application/json" id="orz-includes">', end)) end = html.indexOf('</script>', end + 1) + '</script>'.length;
      return html.slice(end);
    };
    const presKey = (t: string): string => { const p = presentationOf(t); return `${p.theme.id}/${p.measure}`; };
    for (const [, o] of OPTION_SETS) {
      const groups = new Map<string, Set<string>>();
      for (const [, t] of TEXTS) {
        const html = assemble(t, o);
        const k = presKey(t);
        if (!groups.has(k)) groups.set(k, new Set());
        groups.get(k)!.add(`${headPart(html)}\u0000${tail(html)}`);
        // exactly the parts of shellParts for the text's presentation
        const parts = shellParts(o, presentationOf(t));
        expect(headPart(html)).toBe(parts.headHtml);
        expect(tail(html)).toBe(`\n${parts.bodyHtml}\n</body>\n</html>\n`);
      }
      for (const [k, set] of groups) expect(set.size, k).toBe(1);
      // and they carry nothing of a document (uid, title, body)
      expect([...groups.values()].flatMap((g) => [...g]).join('')).not.toMatch(/doc-[0-9a-z]{10}|Lab Safety|Acids, Bases/);
    }
    // the presentation comes from the header only: a body that says "theme: …" changes nothing
    const plain = presentationOf('# T\n\ntheme: dark-elegant-1\nmeasure: full\n');
    expect(plain).toEqual({ theme: themeOf(DEFAULT_THEME), measure: 'normal' });
    const dark = assemble('{{nyml\nkind: document\ntheme: dark-elegant-1\nmeasure: wide\n}}\n\n# T\n', { delivery: 'cdn' });
    expect(dark).toContain(`<link rel="stylesheet" id="orz-theme" href="https://cdn.jsdelivr.net/npm/orz-markdown@${ORZ_MARKDOWN_VERSION}/themes/dark-elegant-1.css">`);
    expect(dark).toContain('<meta name="color-scheme" content="dark">');
    expect(dark).toContain('atom-one-dark.min.css');
    expect(dark).toContain('<article id="orz-doc" class="markdown-body measure-wide"></article>');
    // an unknown theme or measure is the default (the header still holds what the author wrote)
    const unknown = assemble('{{nyml\nkind: document\ntheme: no-such\nmeasure: huge\n}}\n', { delivery: 'cdn' });
    expect(unknown).toContain(`themes/${DEFAULT_THEME}.css`);
    expect(unknown).toContain('<article id="orz-doc" class="markdown-body"></article>');
    const docPart = (html: string): string => html
      .replace(/"delivery":"(inline|cdn)"/, '"delivery":"*"')
      .replace(/<script id="orz-engine"[^>]*>[\s\S]*?<\/script>/, '<engine>');
    for (const [id, text] of TEXTS) {
      const a = docPart(assemble(text, { engineSource: ENGINE }));
      expect(docPart(assemble(text, { delivery: 'cdn' })), id).toBe(a);
      expect(docPart(assemble(text, { engineSource: 'void 0;' })), id).toBe(a);
    }
  });
});

describe('the envelope and the shell parts', () => {
  it('[A.5] the envelope is the kit\'s, with the md markers, banner and includes island', () => {
    for (const [id, text, own] of TEXTS) {
      for (const [, o] of OPTION_SETS) {
        const opts = withOwn(o, own);
        const html = assemble(text, opts);
        expect(html, id).toBe(kit.assembleEnvelope(text, shellParts(opts, presentationOf(text))));
        const delivery = opts.delivery ?? 'inline';
        expect(html).toContain(`<script type="application/json" id="orz-shell">{"kind":"md","format":1,"shell":"${VERSION}","delivery":"${delivery}"}</script>`);
        expect(html).toContain(`<meta name="generator" content="orz-md ${VERSION}">`);
        expect(html).toContain('<!-- orz md document, text format 1. For AI agents and tools:');
        expect(html).toContain('Skill: https://cdn.jsdelivr.net/npm/orz-mdhtml/orz-mdhtml-skills/SKILL.md');
        expect(html.startsWith('<!doctype html>\n<html lang="')).toBe(true);
        expect(html.includes('id="orz-includes"'), id).toBe(!!opts.includes);
      }
    }
    const parts = shellParts({ engineSource: ENGINE });
    expect(parts).toMatchObject({ kind: 'md', shellVersion: VERSION, delivery: 'inline' });
    // the 1.0 shell: head = viewport, colour scheme, theme / KaTeX / highlight.js stylesheets; body = read view, chrome mount, engine
    expect(parts.headHtml.split('\n').map((l) => /^<(meta name="[a-z-]+"|link rel="stylesheet" id="[a-z-]+")/.exec(l)?.[1])).toEqual(['meta name="viewport"', 'meta name="color-scheme"', 'link rel="stylesheet" id="orz-theme"', 'link rel="stylesheet" id="orz-katex"', 'link rel="stylesheet" id="orz-hljs"']);
    expect(parts.bodyHtml).toBe(`<main id="orz-view" class="orz-view" data-orz-theme="${DEFAULT_THEME}"><article id="orz-doc" class="markdown-body"></article></main>\n<div id="orz-chrome"></div>\n<script id="orz-engine">${ENGINE}</script>`);
    expect(shellParts({ engineSource: ENGINE, includes: {} })).not.toHaveProperty('includes');
    // the header decides <title>, lang and #orz-meta
    const doc = CORPUS.find((c) => c.path === 'md/every-construct.md')!;
    const html = assemble(doc.text, { delivery: 'cdn' });
    const info = readDocument(doc.text);
    expect(html).toContain(`<title>${info.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>`);
    expect(html).toContain(`<html lang="${info.lang}" data-orz-kind="md">`);
    expect(html).toContain('"uid": "doc-7k2m9x4q1z"');
  });

  it('[A.6] inline holds the engine once; CDN references the release bundle URL and no engine code', () => {
    const text = CORPUS[0].text;
    const inline = assemble(text, { engineSource: ENGINE });
    expect(inline.split(ENGINE).length - 1).toBe(1);
    expect(inline).toContain(`<script id="orz-engine">${ENGINE}</script>`);
    const cdn = assemble(text, { delivery: 'cdn' });
    const url = `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@${VERSION}/orz-mdhtml.browser.js`;
    expect(cdnBundleUrl()).toBe(url);
    expect(bundleUrl({ kind: 'md', version: VERSION, bundle: { path: BUNDLE_FILE, integrity: '' } })).toBe(url);
    expect(cdn).toContain(`<script id="orz-engine" src="${url}"></script>`);
    expect(cdn).not.toContain(ENGINE);
    expect(cdn.length).toBeLessThan(inline.length + url.length);
  });

  it('[A.7] refusals: NUL, lone surrogate, newer format, unknown delivery, missing or unsafe engine', () => {
    expect(() => assemble('a\u0000b\n', { delivery: 'cdn' })).toThrow(/NUL/);
    expect(() => assemble('a\uD800b\n', { delivery: 'cdn' })).toThrow(/surrogate/);
    expect(() => assemble('{{nyml\nkind: document\nformat: 2\n}}\n\nfuture\n', { delivery: 'cdn' })).toThrow(/format 2/);
    expect(() => assemble('x', { delivery: 'zip' as 'cdn' })).toThrow(/unknown delivery/);
    expect(() => assemble('x')).toThrow(/engine source/);
    expect(() => assemble('x', { engineSource: '' })).toThrow(/engine source/);
    for (const bad of ['a="</script>"', 'a="<script>"', 'a=1;\r\nb=2;', 'a="<\\/script>"']) {
      expect(() => assemble('x', { engineSource: bad }), bad).toThrow(/script-safe/);
    }
  });

  it('[A.10] extract and readDocument are the kit\'s own functions', () => {
    expect(extract).toBe(kit.extract);
    expect(readDocument).toBe(kit.readDocument);
  });
});

// ── isomorphic: no Node built-ins, and the same bytes in real Chrome ────────

const MODULES = ['src/assemble.ts', 'src/presentation.ts', 'src/inspect.ts', 'src/legacy.ts', 'src/themes.ts', 'src/version.ts'];

describe('isomorphic', () => {
  it('[A.8] the assembler modules bundle for the browser with no Node built-in', async () => {
    const { build } = await import('esbuild');
    for (const file of MODULES) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/from ['"](node:|fs['"]|path['"]|os['"]|crypto['"]|url['"]|module['"])/);
      const out = await build({ entryPoints: [file], bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
      const inputs = Object.keys(out.metafile!.inputs);
      expect(inputs.filter((p) => p.startsWith('node:') || /^(fs|path|os|crypto|url|module)$/.test(p)), file).toEqual([]);
    }
  });
});

