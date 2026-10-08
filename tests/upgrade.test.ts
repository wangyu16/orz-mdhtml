/**
 * upgrade: legacy 0.x files to text format 1 (claims U.1–U.5), on the real
 * legacy files (tests/fixtures/legacy/ — the 0.8 example and copies of the
 * local out/ files) and on synthetic ones made from them by replacing the island or the
 * markers the 0.x way (no dependency on the old src/template.ts).
 */
import { describe, it, expect } from 'vitest';
import { readHeader, withoutHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { extractDocMeta } from 'orz-markdown/doc-meta';
import { upgrade, readLegacy } from '../src/legacy.js';
import { inspect } from '../src/inspect.js';
import { assemble, extract, readDocument, newDocument } from '../src/assemble.js';
import { ENGINE, LEGACY_FILES, HAZARDS, read, legacySourceOf, withLegacySource } from './helpers.js';

const UID = 'doc-upgraded0000001';
const META_HTML = read(LEGACY_FILES['fixtures/metadata.md.html']);
const SAMPLE_HTML = read(LEGACY_FILES['fixtures/sample.md.html']);

/** The upgraded text is a header, then (after only whitespace) exactly the legacy source's body. */
function expectSourceKept(text: string, source: string): void {
  const header = readHeader(text);
  expect(header).not.toBeNull();
  expect(header!.legacy).toBeNull();
  const srcHeader = readHeader(source);
  const body = srcHeader ? withoutHeader(source).body : source.replace(/^﻿/, '');
  const after = withoutHeader(text).body;
  expect(after.endsWith(body)).toBe(true);
  expect(after.slice(0, after.length - body.length).trim()).toBe('');
  if (!srcHeader) expect(text.endsWith(source.replace(/^﻿/, ''))).toBe(true);
}

describe('upgrade on the real legacy files', () => {
  it('[U.1] the text is a format-1 header followed by the legacy source exactly', () => {
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      const html = read(path);
      const source = legacySourceOf(html);
      expect(readLegacy(html)!.text === source, name).toBe(true);
      const u = upgrade(html, { delivery: 'cdn', uid: UID });
      expect(u.from).toBe('legacy');
      expectSourceKept(u.text, source);
    }
    // where the original text is at hand, it is that text's body byte for byte
    const metaMd = read('tests/fixtures/legacy/metadata.md');
    expect(legacySourceOf(META_HTML)).toBe(extractDocMeta(metaMd).body);
    expect(withoutHeader(upgrade(META_HTML, { delivery: 'cdn', uid: UID }).text).body).toBe(withoutHeader(metaMd).body);
    const sampleMd = read('tests/fixtures/legacy/sample.md');
    expect(upgrade(SAMPLE_HTML, { delivery: 'cdn', uid: UID }).text.endsWith(sampleMd)).toBe(true);
  });

  it('[U.2] #orz-meta, carrier and uid move into the header; a file-name <title> does not override the heading', () => {
    const u = upgrade(META_HTML, { delivery: 'cdn', uid: UID });
    const h = readHeader(u.text)!;
    expect(h.keys).toEqual(['carrier', 'uid', 'title', 'author', 'description', 'date', 'keywords', 'source', 'license', 'license_name', 'license_url']);
    // the same values as the original kind: meta block of tests/fixtures/legacy/metadata.md
    const original = readHeader(read('tests/fixtures/legacy/metadata.md'))!;
    for (const k of original.keys) expect(h.fields[k], k).toBe(original.fields[k]);
    expect(h.fields['carrier']).toBe('md');
    expect(h.fields['uid']).toBe(UID);
    expect(u.moved).toMatchObject({ carrier: 'md', uid: UID, title: 'Portable Metadata Example', license: 'CC-BY-4.0' });
    expect(u.notes.join('\n')).toMatch(/docId .* is not a valid uid/);
    expect(readDocument(u.text).meta).toMatchObject({ title: 'Portable Metadata Example', author: 'Example Author', keywords: ['mdhtml', 'metadata', 'editable document'], license: { spdx: 'CC-BY-4.0' } });
    // a minted uid without injection
    expect(readHeader(upgrade(META_HTML, { delivery: 'cdn' }).text)!.fields['uid']).toMatch(UID_PATTERN);
    // out/sample: <title> "sample" is the file name; the text's heading gives the title
    const s = upgrade(SAMPLE_HTML, { delivery: 'cdn', uid: UID });
    expect(readHeader(s.text)!.keys).toEqual(['carrier', 'uid']);
    expect(readDocument(s.text).title).toBe('orz-mdhtml');
    expect(s.notes.join('\n')).toMatch(/<title> "sample".*not moved/);
  });

  it('[U.4] the file is the text\'s assembly and extracts back exactly; upgrading again changes nothing', () => {
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      for (const o of [{ delivery: 'cdn' as const }, { engineSource: ENGINE }]) {
        const u = upgrade(read(path), { ...o, uid: UID });
        expect(u.html === assemble(u.text, o), name).toBe(true);
        expect(extract(u.html)!.text === u.text, name).toBe(true);
        expect(inspect(u.html)).toMatchObject({ input: 'assembled', kind: 'md', format: 1, uid: UID, writable: true });
        const again = upgrade(u.html, o);
        expect(again).toEqual({ text: u.text, html: u.html, from: 'format-1', moved: {}, notes: [] });
      }
    }
    // a format-1 file keeps its includes on re-assembly
    const withIncludes = assemble(newDocument({ uid: UID }), { delivery: 'cdn', includes: { './x.md': 'X\r\n' } });
    expect(upgrade(withIncludes, { delivery: 'cdn' }).html).toBe(withIncludes);
  });
});

describe('upgrade on synthetic legacy files', () => {
  it('[U.1] hazard sources survive the 0.x escaping and the upgrade exactly', () => {
    const sources = {
      ...HAZARDS,
      'script-close-cases': '# T\n\n</script> </SCRIPT> </Script > <script>x</script>\n',
      crlf: '# CR LF\r\n\r\nline two\r\n',
      astral: '# 𝒳 👩‍🔬 𠀀\n\ntext\n',
      'blank-edges': '\n\n# padded\n\n\n',
    };
    for (const [name, source] of Object.entries(sources)) {
      if (/<\\\/script/i.test(source)) continue; // the 0.x format cannot carry a literal `<\/script` (the last test)
      const html = withLegacySource(META_HTML, source);
      expect(legacySourceOf(html), name).toBe(source);
      const u = upgrade(html, { delivery: 'cdn', uid: UID });
      expectSourceKept(u.text, source);
      expect(extract(u.html)!.text === u.text, name).toBe(true);
    }
  });

  it('[U.2] a saved theme, a non-default 0.x theme and a valid own uid', () => {
    const themed = META_HTML.replace('<html lang="en" data-chrome="light">', '<html lang="en" data-chrome="dark" data-theme="dark-elegant-2">');
    expect(readHeader(upgrade(themed, { delivery: 'cdn', uid: UID }).text)!.fields['theme']).toBe('dark-elegant-2');
    const defaultTheme = META_HTML.replace('"defaultTheme":"light-neat-3"', '"defaultTheme":"beige-decent-1"');
    expect(readHeader(upgrade(defaultTheme, { delivery: 'cdn', uid: UID }).text)!.fields['theme']).toBe('beige-decent-1');
    expect(readHeader(upgrade(META_HTML, { delivery: 'cdn', uid: UID }).text)!.fields['theme']).toBeUndefined();
    const ownUid = META_HTML.replace(/"docId":"[^"]*"/, '"docId":"doc-legacyown0000001"');
    const u = upgrade(ownUid, { delivery: 'cdn', uid: UID });
    expect(readHeader(u.text)!.fields['uid']).toBe('doc-legacyown0000001');
    expect(u.notes.join('\n')).not.toMatch(/docId/);
    // a source without a heading takes the 0.x <title>
    const untitled = withLegacySource(META_HTML.replace(/<script type="application\/orz-meta\+json" id="orz-meta">[\s\S]*?<\/script>/, ''), 'no heading here\n');
    expect(readHeader(upgrade(untitled, { delivery: 'cdn', uid: UID }).text)!.fields['title']).toBe('Portable Metadata Example');
  });

  it('[U.3] the source\'s own header wins; a typed kind: meta block is converted as FC-18 §5 says', () => {
    const source = '{{nyml\nkind: meta\ntitle: Typed Title\nauthor: Typed Author\nx_host_note: kept\n}}\n\n# Body\n\ntext\n';
    const u = upgrade(withLegacySource(META_HTML, source), { delivery: 'cdn', uid: UID });
    expect(u.text.startsWith('{{nyml\nkind: document\ntitle: Typed Title\nauthor: Typed Author\nx_host_note: kept\ncarrier: md\nuid: doc-upgraded0000001\n')).toBe(true);
    const h = readHeader(u.text)!;
    expect(h.legacy).toBeNull();
    expect(h.fields['title']).toBe('Typed Title');
    expect(h.fields['author']).toBe('Typed Author');
    expect(h.fields['description']).toBe('A minimal mdhtml document with portable authorship and license metadata.');
    expect(u.moved).not.toHaveProperty('title');
    expectSourceKept(u.text, source);
    // a format-1 header in the source: its keys (uid, theme) are kept
    const own = '{{nyml\nkind: document\nuid: doc-sourceown000001\ntheme: light-playful-1\n}}\n\n# Own\n';
    const v = upgrade(withLegacySource(META_HTML.replace('<html lang="en" data-chrome="light">', '<html lang="en" data-theme="dark-elegant-1">'), own), { delivery: 'cdn', uid: UID });
    expect(readHeader(v.text)!.fields).toMatchObject({ uid: 'doc-sourceown000001', theme: 'light-playful-1', carrier: 'md' });
  });

  it('[U.5] unrecognised things are kept or noted, never dropped silently; non-orz input is refused', () => {
    // an island without the 0.x wrapper: kept exactly, noted
    const unwrapped = META_HTML.replace(/(<script type="text\/markdown" id="orz-src">)\n/, '$1');
    const lu = readLegacy(unwrapped)!;
    expect(lu.wrapped).toBe(false);
    expect(inspect(unwrapped).notes.join('\n')).toMatch(/wrapper/);
    const u = upgrade(unwrapped, { delivery: 'cdn', uid: UID });
    expectSourceKept(u.text, lu.text);
    expect(u.notes.join('\n')).toMatch(/wrapper/);
    // an unknown theme: not moved, noted
    const odd = META_HTML.replace('<html lang="en" data-chrome="light">', '<html lang="en" data-theme="my-custom-theme">');
    const t = upgrade(odd, { delivery: 'cdn', uid: UID });
    expect(readHeader(t.text)!.fields['theme']).toBeUndefined();
    expect(t.notes.join('\n')).toMatch(/my-custom-theme.*not moved/);
    // a meta value the header cannot hold: left out, noted
    const curly = META_HTML.replace('"author": "Example Author"', '"author": "Example }} Author"');
    const c = upgrade(curly, { delivery: 'cdn', uid: UID });
    expect(readHeader(c.text)!.fields['author']).toBeUndefined();
    expect(c.notes.join('\n')).toMatch(/author not moved/);
    // unreadable config: noted, the source still upgraded
    const broken = META_HTML.replace('window.__ORZ_MDHTML__ = {', 'window.__ORZ_MDHTML__ = {,');
    expect(readLegacy(broken)!.notes.join('\n')).toMatch(/config/);
    expectSourceKept(upgrade(broken, { delivery: 'cdn', uid: UID }).text, legacySourceOf(META_HTML));
    // non-orz input
    expect(() => upgrade('<!doctype html><html><body>hi</body></html>')).toThrow(/not an orz-mdhtml file/);
    expect(() => upgrade('# plain text\n')).toThrow(/not an orz-mdhtml file/);
  });

  it('[U.5] limit of the 0.x format: a literal `<\\/script` in a 0.x source reads back as `</script` (the 0.x runtime read it so too)', () => {
    const html = withLegacySource(META_HTML, 'a <\\/script> b\n');
    expect(readLegacy(html)!.text).toBe('a </script> b\n');
  });

  it('[U.6] the 0.x wrapper: "\\r\\n…\\r\\n" (a file whose line breaks were converted) is removed like "\\n…\\n"; an island with only a leading line break keeps its content exactly', () => {
    const source = '# CR LF source\r\n\r\ntext\r\n';
    const lf = withLegacySource(META_HTML, source);
    const open = '<script type="text/markdown" id="orz-src">';
    const start = lf.indexOf(open) + open.length;
    const end = lf.indexOf('</script>', start);
    const converted = `${lf.slice(0, start)}\r\n${source}\r\n${lf.slice(end)}`;
    const r = readLegacy(converted)!;
    expect(r.wrapped).toBe(true);
    expect(r.text).toBe(source);
    expect(r.notes.join('\n')).not.toMatch(/wrapper/);
    expectSourceKept(upgrade(converted, { delivery: 'cdn', uid: UID }).text, source);
    // the plain LF wrapper still reads the same
    expect(readLegacy(lf)!.text).toBe(source);
    // a leading line break but no trailing one: not the writer's wrapper — the content is kept exactly, noted
    const noTrail = `${lf.slice(0, start)}\n# no trailing newline${lf.slice(end)}`;
    const n = readLegacy(noTrail)!;
    expect(n.wrapped).toBe(false);
    expect(n.text).toBe('\n# no trailing newline');
    expect(n.notes.join('\n')).toMatch(/wrapper/);
  });
});
