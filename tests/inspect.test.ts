/**
 * inspect: the agent-facing diagnosis (claims I.1–I.5).
 */
import { describe, it, expect } from 'vitest';
import { assembleEnvelope } from 'orz-markdown/carrier';
import { inspect } from '../src/inspect.js';
import { inspect as libInspect, engineSource } from '../src/lib.js';
import { assemble, cdnBundleUrl, newDocument } from '../src/assemble.js';
import { VERSION } from '../src/version.js';
import { sha256 } from '../src/sha256.js';
import { extract } from 'orz-markdown/carrier';
import { corpus, ENGINE, LEGACY_FILES, read } from './helpers.js';

const UID = 'doc-inspect00000001';

describe('inspect', () => {
  it('[I.1] an assembled format-1 file', () => {
    const text = newDocument({ title: 'Inspected', theme: 'light-academic-1', uid: UID });
    const r = inspect(assemble(text, { engineSource: ENGINE, includes: { './a.md': 'A\n', './b.md': 'B\n' } }));
    expect(r).toMatchObject({
      input: 'assembled', kind: 'md', format: 1, writable: true, uid: UID, title: 'Inspected', theme: 'light-academic-1', includes: 2, legacy: null,
      shell: { version: VERSION, generator: `orz-md ${VERSION}`, delivery: 'inline', relation: 'same' },
      header: { present: true, legacy: null, keys: ['carrier', 'uid', 'title', 'theme'] },
      lint: [],
      advice: [],
    });
    const cdn = inspect(assemble(text, { delivery: 'cdn' }));
    expect(cdn.shell!.delivery).toBe('cdn');
    expect(cdn.includes).toBe(0);
    // older and newer shells (the #orz-shell marker of another release)
    const html = assemble(text, { delivery: 'cdn' });
    const older = inspect(html.replace(`"shell":"${VERSION}"`, '"shell":"0.0.1"'));
    expect(older.shell!.relation).toBe('older');
    expect(older.advice.join('\n')).toMatch(/older than this tool.*orz-mdhtml upgrade/);
    expect(older.writable).toBe(true);
    const newer = inspect(html.replace(`"shell":"${VERSION}"`, '"shell":"99.0.0"'));
    expect(newer.shell!.relation).toBe('newer');
    expect(newer.writable).toBe(false);
    expect(newer.advice.join('\n')).toMatch(/newer orz-mdhtml \(99\.0\.0\)/);
    // another kind's file
    const slides = inspect(assembleEnvelope('{{nyml\nkind: document\ntitle: Deck\n}}\n\n<!-- slide -->\n# Deck\n', { kind: 'slides', shellVersion: '1.0.0', headHtml: '', bodyHtml: '' }));
    expect(slides).toMatchObject({ input: 'assembled', kind: 'slides', writable: false });
    expect(slides.shell!.relation).toBe('unknown');
    expect(slides.advice.join('\n')).toMatch(/use orz-slides/);
  });

  it('[I.2] a legacy 0.x file', () => {
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      const r = inspect(read(path));
      expect(r.input, name).toBe('legacy');
      expect(r.kind).toBe('md');
      expect(r.format).toBeNull();
      expect(r.writable).toBe(false);
      expect(r.shell).toBeNull();
      expect(r.legacy!.generator).toBe('orz-mdhtml');
      expect(r.legacy!.version).toMatch(/^0\.\d+\.\d+$/);
      expect(r.legacy!.delivery).toBe('cdn');
      expect(r.legacy!.docId).toMatch(/^[0-9a-f-]{36}$/);
      expect(r.legacy!.theme).toBe('light-neat-3');
      expect(r.advice[0]).toMatch(/orz-mdhtml 0\.\d+\.\d+ file \(made before 1\.0\).*`orz-mdhtml upgrade file\.md\.html`/);
    }
    const meta = inspect(read(LEGACY_FILES['fixtures/metadata.md.html']));
    expect(meta.legacy).toMatchObject({ title: 'Portable Metadata Example', metaKeys: ['title', 'author', 'description', 'source', 'date', 'keywords', 'license'] });
    expect(meta.title).toBe('Portable Metadata Example');
  });

  it('[I.3] texts: corpus, plain Markdown, newer format, other kinds, lint errors', () => {
    for (const c of corpus('md')) {
      const r = inspect(c.text, { filename: c.path });
      expect(r.input, c.path).toBe('text');
      expect(r.kind).toBe('md');
      expect(r.format).toBe(1);
      expect(r.writable).toBe(true);
      expect(r.title).toBe(c.derivedTitle);
      expect(r.uid).toBe(c.header.uid);
      expect(r.header!.present).toBe(c.hasHeader || c.legacyHeader);
      expect(r.header!.legacy).toBe(c.legacyHeader ? 'meta' : null);
      expect(r.advice.join('\n')).toMatch(/orz-mdhtml assemble/);
    }
    const plain = inspect('# Just Markdown\n\nNothing else.\n');
    expect(plain).toMatchObject({ input: 'text', kind: 'md', format: 1, uid: null, title: 'Just Markdown', header: { present: false, keys: [] }, includes: 0 });
    const legacyHeader = inspect(corpus('md').find((c) => c.path === 'md/legacy-meta-block.md')!.text);
    expect(legacyHeader.advice.join('\n')).toMatch(/legacy `kind: meta` block/);
    const newer = inspect('{{nyml\nkind: document\nformat: 2\n}}\n\nfuture\n');
    expect(newer).toMatchObject({ format: 2, writable: false });
    expect(newer.advice.join('\n')).toMatch(/read-only/);
    const slides = corpus('slides')[0];
    const bySlidesName = inspect(slides.text, { filename: slides.path });
    expect(bySlidesName.kind).toBe('slides');
    expect(bySlidesName.writable).toBe(false);
    expect(bySlidesName.advice.join('\n')).toMatch(/use orz-slides/);
    expect(inspect('{{nyml\nkind: document\ncarrier: paged\n}}\n\nx\n').kind).toBe('paged');
    const bad = inspect('{{nyml\nkind: document\nuid: not-a-uid\n}}\n\nx\n');
    expect(bad.uid).toBeNull();
    expect(bad.lint.map((l) => l.code)).toContain('bad-uid');
    expect(bad.advice.join('\n')).toMatch(/header lint errors.*bad-uid/);
  });

  it('[I.4] HTML that is not an orz file', () => {
    for (const html of ['<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>', '<html lang="en"><body><script type="text/markdown" id="orz-src"># foreign</script></body></html>']) {
      const r = inspect(html);
      expect(r.input).toBe('html');
      expect(r.kind).toBeNull();
      expect(r.format).toBeNull();
      expect(r.writable).toBe(false);
      expect(r.advice.length).toBeGreaterThan(0);
    }
  });

  it('[I.5] the report is plain JSON and deterministic', () => {
    const inputs = [
      assemble(newDocument({ uid: UID }), { delivery: 'cdn' }),
      read(LEGACY_FILES['fixtures/metadata.md.html']),
      '{{nyml\nkind: document\nuid: bad\n}}\n',
      '<!doctype html><p>x',
      ...corpus('md').map((c) => c.text),
    ];
    for (const input of inputs) {
      const r = inspect(input);
      expect(JSON.parse(JSON.stringify(r))).toEqual(r);
      expect(inspect(input)).toEqual(r);
    }
  });

  it('[I.6] the sibling twin: a text and its .md.html holding different texts are reported (which is newer, the SHA-256 of the twin\'s text) with advice naming extract -o <x>.browser.md, --replaces <sha256> and --force; a 0.x twin gets upgrade --text <x>.browser.md, never extract; the same text is not', () => {
    const text = newDocument({ uid: UID });
    const browserText = `${text}\nsaved in the browser\n`;
    const browser = assemble(browserText, { delivery: 'cdn' });
    const r = inspect(text, { filename: 'doc.md', twin: { name: 'doc.md.html', content: browser, newer: 'input' } });
    expect(r.twin).toEqual({ name: 'doc.md.html', holds: 'different', newer: 'input', sha256: sha256(browserText) });
    expect(r.sha256).toBe(sha256(text));
    expect(r.advice.join('\n')).toMatch(new RegExp(`doc\\.md\\.html holds a different text.*this file was modified later.*orz-mdhtml extract doc\\.md\\.html -o doc\\.browser\\.md.*orz-mdhtml assemble doc\\.md --replaces ${sha256(browserText)}.*--force`));
    expect(r.advice.join('\n')).not.toMatch(/a text twin: `orz-mdhtml assemble/);
    const fromFile = inspect(browser, { filename: 'doc.md.html', twin: { name: 'doc.md', content: text, newer: 'twin' } });
    expect(fromFile.twin).toEqual({ name: 'doc.md', holds: 'different', newer: 'twin', sha256: sha256(text) });
    expect(fromFile.sha256).toBe(sha256(browserText));
    expect(fromFile.advice.join('\n')).toMatch(new RegExp(`the text twin doc\\.md holds a different text.*doc\\.md was modified later.*orz-mdhtml extract doc\\.md\\.html -o doc\\.browser\\.md.*orz-mdhtml assemble doc\\.md --replaces ${sha256(browserText)}.*orz-mdhtml extract doc\\.md\\.html --replaces ${sha256(text)}`));
    // a 0.x .md.html next to a (0.x) text twin: upgrade --text <x>.browser.md, then merge (round 2, B#3) — from either side
    const legacy = read(LEGACY_FILES['fixtures/sample.md.html']);
    const oldText = '{{nyml\nkind: meta\ntitle: Old\n}}\n\n# my own text\n';
    const fromText = inspect(oldText, { filename: 'sample.md', twin: { name: 'sample.md.html', content: legacy } });
    expect(fromText.twin!.holds).toBe('different');
    expect(fromText.advice.join('\n')).toMatch(/sample\.md\.html is an orz-mdhtml 0\.x file \(made before 1\.0\).*orz-mdhtml upgrade sample\.md\.html --text sample\.browser\.md.*merge.*Not `extract`/);
    expect(fromText.advice.join('\n')).not.toMatch(/orz-mdhtml extract/);
    // and ends with assemble --replaces (the sha256 upgrade printed), never --force (round 3, L3)
    expect(fromText.advice.join('\n')).toMatch(/then `orz-mdhtml assemble sample\.md --replaces <sha256>` with the sha256 upgrade printed/);
    expect(fromText.advice.join('\n')).not.toMatch(/--force/);
    const fromLegacy = inspect(legacy, { filename: 'sample.md.html', twin: { name: 'sample.md', content: oldText } });
    expect(fromLegacy.twin!.holds).toBe('different');
    expect(fromLegacy.advice.join('\n')).toMatch(/next to the text sample\.md, which differs from it: run `orz-mdhtml upgrade sample\.md\.html --text sample\.browser\.md`.*merge/);
    expect(fromLegacy.advice.join('\n')).toMatch(/`orz-mdhtml assemble sample\.md --replaces <sha256>` with the sha256 upgrade printed/);
    expect(fromLegacy.advice.join('\n')).not.toMatch(/--force/);
    expect(inspect(legacy, { filename: 'sample.md.html' }).advice.join('\n')).toMatch(/run `orz-mdhtml upgrade sample\.md\.html` for its text twin/);
    // the same text (mixed line endings stored in one style count as the same)
    const mixed = 'a\r\nb\nc\n';
    expect(inspect(mixed, { twin: { name: 'm.md.html', content: assemble(mixed, { delivery: 'cdn' }) } }).twin).toEqual({ name: 'm.md.html', holds: 'same', newer: 'unknown', sha256: sha256(extract(assemble(mixed, { delivery: 'cdn' }))!.text) });
    expect(inspect(assemble(mixed, { delivery: 'cdn' }), { twin: { name: 'm.md', content: mixed, newer: 'same-time' } }).twin!.holds).toBe('same');
    // a sibling that is not an orz file, and no sibling given
    expect(inspect(text, { twin: { name: 'doc.md.html', content: '<!doctype html><p>x' } }).twin!.holds).toBe('none');
    expect(inspect(text).twin).toBeNull();
  });

  it('[I.9] an empty or blank .md.html is an empty, damaged file — not an empty text', () => {
    for (const content of ['', '  \n']) {
      const r = inspect(content, { filename: 'gone.md.html' });
      expect(r.input).toBe('html');
      expect(r.kind).toBeNull();
      expect(r.advice.join('\n')).toMatch(/the file is empty .*damaged or unfinished.*gone\.md\.html~/);
    }
    expect(inspect('', { filename: 'empty.md' }).input).toBe('text'); // an empty text twin is a text
  });

  it('[I.7] an assembled file\'s structure: a cut island (text may be incomplete), a missing </html>, an altered or cut inline engine (checked against this release\'s bundle; advice: upgrade), a cdn engine URL', () => {
    const text = newDocument({ title: 'Checked', uid: UID });
    const cdn = assemble(text, { delivery: 'cdn' });
    expect(inspect(cdn).checks).toEqual({ island: 'closed', end: 'closed', engine: 'cdn' });
    expect(inspect(cdn.replace(cdnBundleUrl(), 'https://example.test/evil.js')).checks!.engine).toBe('different');
    // the Node library verifies an inline file of this version against this release's bundle
    const inline = assemble(text, { engineSource: engineSource() });
    expect(libInspect(inline).checks).toEqual({ island: 'closed', end: 'closed', engine: 'same' });
    expect(libInspect(inline).advice).toEqual([]);
    const altered = inline.replace('<script id="orz-engine">', '<script id="orz-engine">window.x=1;');
    const a = libInspect(altered);
    expect(a.checks!.engine).toBe('different');
    expect(a.writable).toBe(true); // the text is intact: upgrade re-assembles it
    expect(a.advice.join('\n')).toMatch(/inline engine is not orz-mdhtml .* release bundle.*orz-mdhtml upgrade/);
    // without a reference bundle (the isomorphic inspect), or another shell version: not verified
    expect(inspect(inline).checks!.engine).toBe('unverified');
    expect(libInspect(inline.replace(`"shell":"${VERSION}"`, '"shell":"0.0.1"')).checks!.engine).toBe('unverified');
    // cut after the island: the text is complete, the page is not
    const cutEngine = inline.slice(0, inline.indexOf('<script id="orz-engine">') + 5000);
    const ce = libInspect(cutEngine);
    expect(ce.checks).toEqual({ island: 'closed', end: 'unclosed', engine: 'different' });
    expect(ce.advice.join('\n')).toMatch(/does not end with <\/html>.*upgrade/);
    // cut inside the island: the text may be incomplete
    const cutIsland = cdn.slice(0, cdn.indexOf('Start writing') + 5);
    const ci = inspect(cutIsland);
    expect(ci.input).toBe('assembled');
    expect(ci.checks).toMatchObject({ island: 'unclosed', end: 'unclosed' });
    expect(ci.writable).toBe(false);
    expect(ci.advice.join('\n')).toMatch(/not closed.*text may be incomplete — recover what you can: `orz-mdhtml extract file\.md\.html -o file\.recovered\.md`/);
    expect(ci.advice.join('\n')).not.toMatch(/upgrade file\.md\.html` re-assembles/); // never "re-assemble it" from a cut text (round 2, B#4)
    const ciNamed = inspect(cutIsland.split(`"shell":"${VERSION}"`).join('"shell":"0.0.1"'), { filename: 'notes.md.html' });
    expect(ciNamed.advice.join('\n')).toMatch(/orz-mdhtml extract notes\.md\.html -o notes\.recovered\.md/);
    expect(ciNamed.advice.join('\n')).not.toMatch(/older than this tool/);
    // texts, legacy files and plain HTML have no structure report
    expect(inspect(text).checks).toBeNull();
    expect(inspect(read(LEGACY_FILES['fixtures/sample.md.html'])).checks).toBeNull();
  });

  it('[I.8] advice names the files as the caller named them (quoted for the shell when needed), never a literal placeholder: an assembled file, a text, a legacy file, a damaged engine, an older shell', () => {
    const text = newDocument({ uid: UID });
    const cdn = assemble(text, { delivery: 'cdn' });
    const cases: Array<[string, string]> = [
      [text, 'sub/notes.md'],
      [cdn.split(`"shell":"${VERSION}"`).join('"shell":"0.0.1"'), 'sub/notes.md.html'],
      [cdn.slice(0, cdn.indexOf('Start writing') + 5), 'sub/notes.md.html'],
      [read(LEGACY_FILES['fixtures/sample.md.html']), 'sub/notes.md.html'],
      [assemble(text, { engineSource: 'void 0;' }), 'sub/notes.md.html'],
    ];
    for (const [input, filename] of cases) {
      const advice = libInspect(input, { filename }).advice.join('\n');
      expect(advice, filename).not.toMatch(/<file>|<other>/);
      expect(advice, filename).toContain(` ${filename}`);
    }
    // a name with a space is quoted for the shell
    expect(inspect(text, { filename: 'my notes.md' }).advice.join('\n')).toContain("`orz-mdhtml assemble 'my notes.md'`");
    // without a name: a generic one, not a placeholder in angle brackets
    expect(inspect(text).advice.join('\n')).toContain('`orz-mdhtml assemble file.md`');
  });
});
