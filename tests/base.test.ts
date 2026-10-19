/**
 * Rebuild step 1 — the base: orz-markdown ^2.3.0 without shims, one theme
 * list, the version constant (claims B.1–B.3).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { THEMES, DEFAULT_THEME, isThemeId } from '../src/themes.js';
import { VERSION as INSTALLED_KIT } from 'orz-markdown/version';
import { VERSION, ORZ_MARKDOWN_VERSION } from '../src/version.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };
const sources = (dir: string): string[] => readdirSync(dir).filter((f) => /\.(ts|js|cjs|mjs)$/.test(f)).map((f) => `${dir}/${f}`);

describe('base', () => {
  it('[B.1] depends on orz-markdown ^2.3.0 with no shims, aliases or package.json walk', () => {
    expect(pkg.dependencies['orz-markdown']).toBe('^2.3.0');
    expect(existsSync('build/shims')).toBe(false);
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('path-browserify');
    for (const file of [...sources('src'), ...sources('build')]) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/path-browserify|build\/shims|shims\/|inject\s*:/);
      expect(src, file).not.toMatch(/require\.resolve\(['"]orz-markdown|orzPackageJson|walking up/);
    }
    // read at build time only (1.0.2): src/version.ts bakes the kit the build bundles; src/ never imports the installed kit's version
    expect(readFileSync('scripts/sync-version.ts', 'utf8')).toMatch(/from 'orz-markdown\/version'/);
    expect(readFileSync('build/bundle.ts', 'utf8')).toMatch(/from 'orz-markdown\/version'/);
    for (const file of [...sources('src'), ...sources('src/browser'), ...sources('src/browser/md')]) expect(readFileSync(file, 'utf8'), file).not.toMatch(/from 'orz-markdown\/version'/);
  });

  it('[B.2] one theme list — the kit\'s (orz-markdown/themes), equal to the stylesheets it ships', () => {
    const shipped = readdirSync('node_modules/orz-markdown/themes').filter((f) => f.endsWith('.css') && f !== 'common.css').map((f) => f.slice(0, -4)).sort();
    expect(THEMES.map((t) => t.id).sort()).toEqual(shipped);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    // the kit's list, re-exported: no second list anywhere in src/
    expect(readFileSync('src/themes.ts', 'utf8')).toMatch(/export \{ THEMES, DEFAULT_THEME, isThemeId, themeInfo \} from 'orz-markdown\/themes'/);
    for (const file of sources('src')) {
      expect(readFileSync(file, 'utf8').match(/'dark-elegant-2'/g) ?? [], file).toEqual([]);
    }
  });

  it('[B.3] VERSION is the package version; ORZ_MARKDOWN_VERSION is the kit this build bundles', () => {
    expect(VERSION).toBe(pkg.version);
    expect(ORZ_MARKDOWN_VERSION).toBe(INSTALLED_KIT);
  });
});
