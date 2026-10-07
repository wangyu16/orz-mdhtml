/**
 * newDocument: the creation tool's text (claims N.1–N.4).
 */
import { describe, it, expect } from 'vitest';
import { lintHeader, readHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { newDocument, readDocument, assemble, extract } from '../src/assemble.js';
import { THEMES } from '../src/themes.js';

const UID = 'doc-newdocument0001';

describe('newDocument', () => {
  it('[N.1] header order and values; lint clean; readDocument agrees', () => {
    const text = newDocument({ title: 'Cell Biology — Week 3', theme: 'dark-elegant-3', measure: 'wide', lang: 'zh-Hans', uid: UID });
    expect(text).toBe(
      '{{nyml\nkind: document\ncarrier: md\nuid: doc-newdocument0001\ntitle: Cell Biology — Week 3\ntheme: dark-elegant-3\nmeasure: wide\nlang: zh-Hans\n}}\n\n# Cell Biology — Week 3\n\nStart writing here.\n',
    );
    expect(lintHeader(text)).toEqual([]);
    expect(lintHeader(text, 'md')).toEqual([]);
    const doc = readDocument(text);
    expect(doc.kind).toBe('md');
    expect(doc.header!.legacy).toBeNull();
    expect(doc.header!.keys).toEqual(['carrier', 'uid', 'title', 'theme', 'measure', 'lang']);
    expect(doc.header!.fields['carrier']).toBe('md');
    expect(doc.meta.uid).toBe(UID);
    expect(doc.title).toBe('Cell Biology — Week 3');
    expect(doc.theme).toBe('dark-elegant-3');
    expect(doc.settings['measure']).toBe('wide');
    expect(doc.lang).toBe('zh-Hans');
    expect(doc.format).toBe(1);
    // minimal: only carrier and uid
    const bare = newDocument({ uid: UID });
    expect(bare).toBe('{{nyml\nkind: document\ncarrier: md\nuid: doc-newdocument0001\n}}\n\n# Untitled\n\nStart writing here.\n');
    expect(lintHeader(bare, 'md')).toEqual([]);
    expect(readDocument(bare).title).toBe('Untitled');
    for (const t of THEMES) expect(lintHeader(newDocument({ theme: t.id, uid: UID }), 'md')).toEqual([]);
  });

  it('[N.2] a fresh uid per call without an injected one; pure with one', () => {
    const uids = new Set(Array.from({ length: 20 }, () => readHeader(newDocument({ title: 'x' }))!.fields['uid']));
    expect(uids.size).toBe(20);
    for (const u of uids) expect(u).toMatch(UID_PATTERN);
    expect(newDocument({ title: 'x', uid: UID })).toBe(newDocument({ title: 'x', uid: UID }));
  });

  it('[N.3] refusals', () => {
    expect(() => newDocument({ theme: 'no-such-theme', uid: UID })).toThrow(/unknown theme/);
    expect(() => newDocument({ measure: 'huge' as 'wide', uid: UID })).toThrow(/unknown measure/);
    expect(() => newDocument({ uid: 'doc-SHORT' })).toThrow(/malformed uid/);
    expect(() => newDocument({ uid: 'abc-0123456789' })).toThrow(/malformed uid/);
    expect(() => newDocument({ title: 'two\nlines', uid: UID })).toThrow();
    expect(() => newDocument({ title: 'a }} b', uid: UID })).toThrow();
  });

  it('[N.4] a new document assembles and extracts exactly; the file derives from its header', () => {
    const text = newDocument({ title: 'Quoted "title" & <tags>', lang: 'fr', uid: UID });
    const html = assemble(text, { delivery: 'cdn' });
    expect(extract(html)!.text).toBe(text);
    expect(html).toContain('<html lang="fr" data-orz-kind="md">');
    expect(html).toContain('<title>Quoted "title" &amp; &lt;tags&gt;</title>');
    expect(html).toContain(`"uid": "${UID}"`);
  });
});
