/**
 * Builds the `orz-mdhtml-browser` package (browser/):
 *
 * - `orz-mdhtml.browser.js` — the IIFE (src/browser/index.ts) that sets
 *   `globalThis.OrzCarrier` (FC-19 §2) and boots an assembled file. It obeys
 *   the BUNDLE RULE (spec/shell-runtime.md §6): every `<` before
 *   `script`/`/script` is rewritten as `\x3C` (same value in every string,
 *   template and regular expression), then it must be script-safe (the kit's
 *   `isScriptSafe`) and hold no CR or NUL — else the build fails;
 * - `esm/orz-mdhtml.browser.mjs` — the same API as ES module exports
 *   (src/browser/esm.ts), for apps that bundle it themselves;
 * - `release.json` — the release manifest (kind, version, formats, notes,
 *   bundle path and the SHA-384 integrity of the IIFE's exact bytes, computed
 *   AFTER the rewrite).
 *
 * One KaTeX: orz-markdown's CommonJS build requires `katex` and
 * `katex/contrib/mhchem`; both resolve to KaTeX's CommonJS build here, so
 * `\ce{…}` is registered on the KaTeX that renders (as orz-markdown's
 * conformance stub build does).
 *
 * The same IIFE and `release.json` are also staged into `dist/` (the
 * `orz-mdhtml` package): the Node library's `assemble` inlines exactly that
 * file (src/engine.ts checks it against the manifest), so an inline file made
 * by the CLI carries the very bytes `orz-mdhtml-browser` publishes.
 *
 * `buildBrowser({ version })` builds in memory (tests; a `next` release with a
 * higher version for the conformance harness): the version replaces
 * src/version.ts for that build only.
 */
import { build, type Plugin } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { isScriptSafe } from 'orz-markdown/carrier/shell';
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE_FILE = 'orz-mdhtml.browser.js';
export const ESM_FILE = 'esm/orz-mdhtml.browser.mjs';

/** The bundle rule's rewrite: `<script` / `</script` (any case, after backslashes) → `\x3C…`. */
export const scriptSafe = (code: string): string => code.replace(/<(\\*)(\/?script)/gi, '\\x3C$1$2');

export const sri = (bytes: string): string => `sha384-${createHash('sha384').update(bytes, 'utf8').digest('base64')}`;

const oneKatex: Plugin = {
  name: 'one-katex',
  setup(b) {
    const dir = join(ROOT, 'node_modules', 'katex', 'dist');
    b.onResolve({ filter: /^katex$/ }, () => ({ path: join(dir, 'katex.js') }));
    b.onResolve({ filter: /^katex\/contrib\/mhchem$/ }, () => ({ path: join(dir, 'contrib', 'mhchem.js') }));
  },
};

/** src/version.ts replaced by another version (a `next` build); the package version otherwise. */
const versionAs = (version: string | undefined): Plugin => ({
  name: 'version-as',
  setup(b) {
    if (version === undefined) return;
    b.onLoad({ filter: /[\\/]src[\\/]version\.ts$/ }, () => ({ contents: `export const VERSION = ${JSON.stringify(version)};\n`, loader: 'ts' }));
  },
});

export interface BrowserBuild {
  version: string;
  /** The IIFE's exact text (after the rewrite). */
  iife: string;
  esm: string;
  /** `release.json`'s content (formatted, with a final newline). */
  release: string;
  integrity: string;
}

/** The release notes link of a version. */
const notesUrl = (v: string): string => `https://github.com/wangyu16/orz-mdhtml/blob/main/CHANGELOG.md#${v.replace(/[^0-9a-z]/gi, '')}`;

/** Check the bundle rule on built code; throws with the reason. */
export function checkBundleRule(code: string, what: string): void {
  if (!isScriptSafe(code)) throw new Error(`${what}: not script-safe after the rewrite (a <script or </script sequence remains)`);
  if (code.includes('\r')) throw new Error(`${what}: holds a CR (U+000D); an inlined copy would not match its integrity`);
  if (code.includes('\u0000')) throw new Error(`${what}: holds a NUL`);
}

/** Build the IIFE, the ESM build and release.json in memory. */
export async function buildBrowser(o: { version?: string } = {}): Promise<BrowserBuild> {
  const pkgVersion = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  const version = o.version ?? pkgVersion;
  const common = {
    bundle: true, minify: true, platform: 'browser' as const, target: ['es2020'], write: false, logLevel: 'silent' as const,
    charset: 'utf8' as const, legalComments: 'none' as const, absWorkingDir: ROOT, plugins: [oneKatex, versionAs(o.version)],
  };
  const [iifeOut, esmOut] = await Promise.all([
    build({ ...common, entryPoints: ['src/browser/index.ts'], format: 'iife' }),
    build({ ...common, entryPoints: ['src/browser/esm.ts'], format: 'esm' }),
  ]);
  const iife = scriptSafe(iifeOut.outputFiles![0].text);
  const esm = scriptSafe(esmOut.outputFiles![0].text);
  checkBundleRule(iife, BUNDLE_FILE);
  checkBundleRule(esm, ESM_FILE);
  const integrity = sri(iife);
  const release = `${JSON.stringify({ kind: 'md', version, formats: [1], notes: notesUrl(version), bundle: { path: BUNDLE_FILE, integrity } }, null, 2)}\n`;
  return { version, iife, esm, release, integrity };
}

/** Write a build into a package folder (default browser/). */
export function writeBrowser(b: BrowserBuild, dir = join(ROOT, 'browser')): { bundle: string; esm: string; release: string } {
  mkdirSync(join(dir, 'esm'), { recursive: true });
  const paths = { bundle: join(dir, BUNDLE_FILE), esm: join(dir, ESM_FILE), release: join(dir, 'release.json') };
  writeFileSync(paths.bundle, b.iife, 'utf8');
  writeFileSync(paths.esm, b.esm, 'utf8');
  writeFileSync(paths.release, b.release, 'utf8');
  return paths;
}

/** Stage the IIFE and release.json into the `orz-mdhtml` package (dist/), for the Node library (src/engine.ts). */
export function writeLibEngine(b: BrowserBuild, dir = join(ROOT, 'dist')): { bundle: string; release: string } {
  mkdirSync(dir, { recursive: true });
  const paths = { bundle: join(dir, BUNDLE_FILE), release: join(dir, 'release.json') };
  writeFileSync(paths.bundle, b.iife, 'utf8');
  writeFileSync(paths.release, b.release, 'utf8');
  return paths;
}

const kb = (s: string): string => `${(Buffer.byteLength(s, 'utf8') / 1024).toFixed(1)} KiB (gzip ${(gzipSync(s).length / 1024).toFixed(1)} KiB)`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const b = await buildBrowser();
  const paths = writeBrowser(b);
  const lib = writeLibEngine(b);
  console.log(`orz-mdhtml-browser ${b.version} (orz-markdown ${ORZ_MARKDOWN_VERSION}):`);
  console.log(`  ${paths.bundle}  ${kb(b.iife)}  ${b.integrity}`);
  console.log(`  ${paths.esm}  ${kb(b.esm)}`);
  console.log(`  ${paths.release}`);
  console.log(`  ${lib.bundle} + ${lib.release} (the Node library's engine, same bytes)`);
}
