/**
 * Rebuild step 5 — the Node library (claims P.1, P.2): inline assembly with
 * this release's real browser bundle (the dist/ copy, verified against its
 * release.json), and the 1.0 package surface with the 0.9 API and runtime gone.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract as kitExtract } from 'orz-markdown/carrier';
import * as lib from '../src/lib.js';
import { assemble as assembleWith } from '../src/assemble.js';
import { upgrade as upgradeWith } from '../src/legacy.js';
import { readEngine } from '../src/engine.js';
import { VERSION } from '../src/version.js';
import { bundle } from './browser-env.js';
import { corpus, HAZARDS, LEGACY_FILES, read } from './helpers.js';

const b = await bundle();
const tmp = mkdtempSync(join(tmpdir(), 'orz-mdhtml-lib-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('the Node library', () => {
  it('[P.1] inline assembly carries this release\'s bundle: the dist/ copy = orz-mdhtml-browser\'s file = the build, verified against release.json; assemble and upgrade need no engine', () => {
    const engine = lib.engineFiles();
    expect(engine.bundle).toBe(join(process.cwd(), 'dist', 'orz-mdhtml.browser.js'));
    expect(engine.source === b.iife).toBe(true);
    expect(engine.source === readFileSync('browser/orz-mdhtml.browser.js', 'utf8')).toBe(true);
    expect(readFileSync(engine.release, 'utf8')).toBe(b.release);
    expect(readFileSync('browser/release.json', 'utf8')).toBe(b.release);
    expect(engine.integrity).toBe(b.integrity);
    expect(lib.engineSource() === b.iife).toBe(true);

    const SOME = { './part.md': 'Included </script> text\r\n', 'https://example.test/x.md': '# x\n' };
    for (const c of [...corpus('md').slice(0, 6).map((x) => x.text), ...Object.values(HAZARDS)]) {
      const inline = lib.assemble(c);
      expect(inline === assembleWith(c, { engineSource: b.iife })).toBe(true);
      expect(inline.split(b.iife).length - 1).toBe(1);
      expect(lib.assemble(c, { includes: SOME }) === assembleWith(c, { engineSource: b.iife, includes: SOME })).toBe(true);
      expect(lib.assemble(c, { delivery: 'cdn' })).toBe(assembleWith(c, { delivery: 'cdn' }));
      expect(lib.extract(inline)!.text === c).toBe(true);
    }
    // an explicit engine still wins (the conformance harness passes next's)
    expect(lib.assemble('# x\n', { engineSource: 'window.x=1;' })).toBe(assembleWith('# x\n', { engineSource: 'window.x=1;' }));
    for (const path of Object.values(LEGACY_FILES)) {
      const r = lib.upgrade(read(path), { uid: 'doc-libupgrade000001' });
      expect(r.html === upgradeWith(read(path), { uid: 'doc-libupgrade000001', engineSource: b.iife }).html).toBe(true);
      expect(kitExtract(r.html)!.delivery).toBe('inline');
    }

    // refused, never inlined: missing, stale (another version), altered, not script-safe
    const dir = (name: string): string => { const d = join(tmp, name); mkdirSync(d, { recursive: true }); cpSync(engine.bundle, join(d, 'orz-mdhtml.browser.js')); cpSync(engine.release, join(d, 'release.json')); return d; };
    expect(() => readEngine([join(tmp, 'none')])).toThrow(/missing.*npm run bundle/);
    expect(readEngine([dir('good')]).source === b.iife).toBe(true);
    expect(() => readEngine([dir('stale')], '9.9.9')).toThrow(/not this release's 9\.9\.9/);
    const altered = dir('altered');
    writeFileSync(join(altered, 'orz-mdhtml.browser.js'), `${b.iife};`, 'utf8');
    expect(() => readEngine([altered])).toThrow(/integrity/);
    const unsafe = dir('unsafe');
    const bad = `${b.iife}"</script>";`;
    writeFileSync(join(unsafe, 'orz-mdhtml.browser.js'), bad, 'utf8');
    const m = JSON.parse(b.release) as { bundle: { integrity: string } };
    m.bundle.integrity = `sha384-${createHash('sha384').update(bad, 'utf8').digest('base64')}`;
    writeFileSync(join(unsafe, 'release.json'), JSON.stringify(m), 'utf8');
    expect(() => readEngine([unsafe])).toThrow(/script-safe/);
  });

  it('[P.2] the package is the 1.0 surface: the library exports the format-1 API only; the 0.9 API and runtime are gone; bin, exports and files', () => {
    expect(Object.keys(lib).sort()).toEqual([
      'BUNDLE_FILE', 'DEFAULT_MEASURE', 'DEFAULT_THEME', 'FORMATS', 'MEASURES', 'ORZ_MARKDOWN_VERSION', 'THEMES', 'VERSION',
      'assemble', 'cdnBundleUrl', 'engineFiles', 'engineSource', 'extract', 'inspect', 'isThemeId', 'newDocument', 'readDocument', 'readLegacy', 'upgrade',
    ].sort());
    for (const gone of ['buildMdHtml', 'composeInlineMdHtml', 'findRendererBundle', 'findAsset', 'orzVersionOf', 'selfVersionOf']) expect(lib).not.toHaveProperty(gone);
    expect(lib.VERSION).toBe(VERSION);
    expect(lib.FORMATS).toEqual([1]);
    for (const f of ['assets/app.js', 'assets', 'src/template.ts', 'src/browser-entry.ts', 'dist/orzmd.browser.js', 'dist/template.js', 'dist/browser-entry.js']) expect(existsSync(f), f).toBe(false);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { bin: Record<string, string>; main: string; exports: Record<string, unknown>; files: string[] };
    expect(pkg.bin).toEqual({ 'orz-mdhtml': 'dist/cli.js' });
    expect(pkg.main).toBe('./dist/lib.js');
    expect(pkg.exports['.']).toEqual({ types: './dist/lib.d.ts', default: './dist/lib.js' });
    expect(pkg.files).toContain('dist');
    expect(pkg.files).not.toContain('assets');
    const bundleSrc = readFileSync('build/bundle.ts', 'utf8');
    expect(bundleSrc).not.toMatch(/orzmd\.browser|browser-entry/);
    // nothing in src/ or build/ refers to the 0.9 runtime
    for (const f of ['src/lib.ts', 'src/cli.ts', 'src/engine.ts', 'build/bundle.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/template\.js|assets\/app|__ORZ_MDHTML__ =/);
  });
});
