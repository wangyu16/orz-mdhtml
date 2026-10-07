/**
 * The lift seam (REBUILD §3a owner decision 2; claim L.1): the standalone
 * startup's kind-independent modules know nothing of the md carrier, so they
 * can move to orz-markdown `carrier/app` before orz-paged unchanged but for
 * their imports.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const KIND_INDEPENDENT = [
  ...readdirSync('src/browser/standalone').map((f) => `src/browser/standalone/${f}`),
  ...readdirSync('src/browser/ui').map((f) => `src/browser/ui/${f}`),
  'src/browser/engine-source.ts',
];

describe('the lift seam', () => {
  it('[L.1] the kind-independent startup imports only orz-markdown\'s carrier entries and its own modules — nothing of the md carrier', () => {
    expect(KIND_INDEPENDENT.length).toBeGreaterThanOrEqual(5);
    for (const file of KIND_INDEPENDENT) {
      const src = readFileSync(file, 'utf8');
      const imports = [...src.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      for (const spec of imports) {
        const ok = /^orz-markdown\/carrier(\/(shell|editor|read))?$/.test(spec) || /^\.\/[a-z-]+\.js$/.test(spec) || /^\.\.\/(ui\/widgets|standalone\/types|engine-source)\.js$/.test(spec);
        expect(ok, `${file} imports ${spec}`).toBe(true);
      }
      // the kind registry (FC-17) names every kind; nothing else may name md
      const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace("'md' | 'slides' | 'paged'", '');
      expect(code, file).not.toMatch(/\bmd\b['"]|markdown-body|measure|light-neat|renderMarkdownPreview|\.md\.html/);
    }
  });
});
