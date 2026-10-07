/**
 * Rebuild step 1 — the base: orz-markdown ^2.1.0 without shims, one theme
 * list, the version constant (claims B.1–B.3).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { THEMES, DEFAULT_THEME, isThemeId } from '../src/themes.js';
import { VERSION } from '../src/version.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };
const sources = (dir: string): string[] => readdirSync(dir).filter((f) => /\.(ts|js|cjs|mjs)$/.test(f)).map((f) => `${dir}/${f}`);

describe('base', () => {
  it('[B.1] depends on orz-markdown ^2.1.0 with no shims, aliases or package.json walk', () => {
    expect(pkg.dependencies['orz-markdown']).toBe('^2.1.0');
    expect(existsSync('build/shims')).toBe(false);
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('path-browserify');
    for (const file of [...sources('src'), ...sources('build')]) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/path-browserify|build\/shims|shims\/|inject\s*:/);
      expect(src, file).not.toMatch(/require\.resolve\(['"]orz-markdown|orzPackageJson|walking up/);
    }
    expect(readFileSync('src/lib.ts', 'utf8')).toMatch(/from 'orz-markdown\/version'/);
    expect(readFileSync('build/bundle.ts', 'utf8')).toMatch(/from 'orz-markdown\/version'/);
  });

  it('[B.2] one theme list, equal to the stylesheets orz-markdown ships', () => {
    const shipped = readdirSync('node_modules/orz-markdown/themes').filter((f) => f.endsWith('.css') && f !== 'common.css').map((f) => f.slice(0, -4)).sort();
    expect(THEMES.map((t) => t.id).sort()).toEqual(shipped);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    // no second list anywhere in src/
    for (const file of sources('src').filter((f) => f !== 'src/themes.ts')) {
      expect(readFileSync(file, 'utf8').match(/'dark-elegant-2'/g) ?? [], file).toEqual([]);
    }
  });

  it('[B.3] VERSION is the package version', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
