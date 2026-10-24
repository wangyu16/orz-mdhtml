/**
 * Rebuild step 1 — the base: orz-markdown (^, at least release.config.json
 * kit.required) without shims, one theme list, the version constant (claims
 * B.1–B.3). The kit's range is read from package.json and its floor from
 * release.config.json, never written here (D-117: a kit bump — propagate —
 * must not fail the fast lane on a literal).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { THEMES, DEFAULT_THEME, isThemeId } from '../src/themes.js';
import { VERSION as INSTALLED_KIT } from 'orz-markdown/version';
import { VERSION, ORZ_MARKDOWN_VERSION } from '../src/version.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };
const sources = (dir: string): string[] => readdirSync(dir).filter((f) => /\.(ts|js|cjs|mjs)$/.test(f)).map((f) => `${dir}/${f}`);
/** The kit floor the code needs (release.config.json `kit.required`), and whether a `^X.Y.Z` range meets it (same major, X.Y.Z ≥ it). */
const KIT = (JSON.parse(readFileSync('release.config.json', 'utf8')) as { kit: { name: string; required: string } }).kit;
const v3 = (v: string): number[] => v.split('.').map(Number);
const meetsFloor = (range: string, floor: string): boolean => {
  const m = /^\^(\d+\.\d+\.\d+)$/.exec(range);
  if (!m) return false;
  const [a, b] = [v3(m[1] as string), v3(floor)];
  return a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && a[2]! >= b[2]!));
};

describe('base', () => {
  it('[B.1] depends on orz-markdown ^X.Y.Z at least the kit the code needs (release.config.json kit.required) with no shims, aliases or package.json walk', () => {
    expect(KIT.name).toBe('orz-markdown');
    expect(KIT.required).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies['orz-markdown'], `^X.Y.Z at least ${KIT.required}`).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(meetsFloor(pkg.dependencies['orz-markdown'] as string, KIT.required), `${pkg.dependencies['orz-markdown']} meets ${KIT.required}`).toBe(true);
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
    expect(readFileSync('src/themes.ts', 'utf8')).toMatch(/export \{ THEMES, DEFAULT_THEME, isThemeId, themeInfo, themeSwatch \} from 'orz-markdown\/themes'/);
    for (const file of sources('src')) {
      expect(readFileSync(file, 'utf8').match(/'dark-elegant-2'/g) ?? [], file).toEqual([]);
    }
  });

  it('[B.3] VERSION is the package version; ORZ_MARKDOWN_VERSION is the kit this build bundles', () => {
    expect(VERSION).toBe(pkg.version);
    expect(ORZ_MARKDOWN_VERSION).toBe(INSTALLED_KIT);
  });

  it('[B.4] both prepublishOnlys run the family release gate and the stamp check, never the suite; the tiers are scripts; the tooling is not shipped; the installed kit passes the gate (family Phase 4)', async () => {
    const p = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string>; files: string[] };
    expect(p.scripts['prepublishOnly']).toBe('npm run build && tsx scripts/release-check.ts --after-build && tsx scripts/test-release.ts --check');
    expect(p.scripts['release:check']).toBe('tsx scripts/release-check.ts');
    expect(p.scripts['test:release']).toBe('tsx scripts/test-release.ts');
    expect(p.scripts['test:fast']).toBe('tsx scripts/test-release.ts --fast');
    expect(p.scripts['test:changed']).toBe('tsx scripts/test-release.ts --changed');
    const browser = JSON.parse(readFileSync('browser/package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(browser.scripts['prepublishOnly']).toBe('node scripts/check-release.mjs && cd .. && npx tsx scripts/release-check.ts && npx tsx scripts/test-release.ts --check');
    expect(readFileSync('.gitignore', 'utf8').split('\n')).toContain('.release/');
    for (const f of p.files) expect(f, 'the release tooling is never shipped').not.toMatch(/^(scripts|\.release|release\.config\.json)/);
    const { loadConfig, releaseProblems, releaseState } = await import('../scripts/release-check.js');
    const config = loadConfig(process.cwd());
    expect(config.kit).toEqual(KIT);
    expect(config.checks).toEqual([['node', 'browser/scripts/check-release.mjs']]);
    expect(releaseProblems(releaseState(process.cwd(), config), config).filter((x) => /orz-markdown/.test(x))).toEqual([]);
  });
});
