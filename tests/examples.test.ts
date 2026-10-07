/**
 * The committed examples never go stale (claim E.1): every `examples/*.md.html`
 * is exactly a fresh assembly of its text twin `examples/*.md` with this
 * release (its delivery and includes kept), and every text twin has its file.
 * Regenerate with `npm run build && npm run examples`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { assemble, extract, inspect, VERSION } from '../src/lib.js';

const DIR = 'examples';
const texts = readdirSync(DIR).filter((f) => f.endsWith('.md')).sort();
const files = readdirSync(DIR).filter((f) => f.endsWith('.md.html')).sort();

describe('examples', () => {
  it('[E.1] every committed example is a fresh assembly of its text twin (run `npm run examples` when this fails)', () => {
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(files).toEqual(texts.map((t) => `${t}.html`));
    const deliveries = new Set<string>();
    for (const name of texts) {
      const text = readFileSync(`${DIR}/${name}`, 'utf8');
      const html = readFileSync(`${DIR}/${name}.html`, 'utf8');
      const ex = extract(html);
      expect(ex, name).not.toBeNull();
      expect(ex!.text === text, `${name}: the file's text is not its twin`).toBe(true);
      expect(ex!.shell, `${name}: made by another version`).toBe(VERSION);
      deliveries.add(ex!.delivery);
      const fresh = assemble(text, { delivery: ex!.delivery as 'inline' | 'cdn', ...(ex!.includes ? { includes: ex!.includes } : {}) });
      expect(fresh === html, `${name}.html is stale: run \`npm run build && npm run examples\``).toBe(true);
      const r = inspect(text, { filename: name });
      expect(r.lint.filter((l) => l.level === 'error'), name).toEqual([]);
      expect(r.uid, name).not.toBeNull();
    }
    // one inline example (the default) and one for the web
    expect([...deliveries].sort()).toEqual(['cdn', 'inline']);
  });
});
