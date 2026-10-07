/**
 * Bundles src/browser-entry.ts (+ orz-markdown and its dependencies) into a
 * single browser IIFE at dist/orzmd.browser.js.
 *
 * This artifact is what makes client-side re-rendering (edit mode) possible.
 * It is either inlined into each .md.html (`--inline`) or published to npm as
 * `orz-mdhtml-browser` and served from jsDelivr (`--cdn`, Delivery C).
 *
 * orz-markdown ≥ 2 is browser-clean (no `fs`, `path` or `process` at import),
 * so no shims or aliases are needed (rebuild step 1; D-40, D-44, D-45).
 */
import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';

const HERE = dirname(fileURLToPath(import.meta.url));

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/browser-entry.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  outfile: 'dist/orzmd.browser.js',
  minify: true,
  sourcemap: false,
  define: {
    __ORZMD_VERSION__: JSON.stringify(ORZ_MARKDOWN_VERSION),
  },
  logLevel: 'info',
});

// Also stage the bundle into the orz-mdhtml-browser package (published to CDN).
const browserPkgDir = join(HERE, '..', 'browser');
mkdirSync(browserPkgDir, { recursive: true });
copyFileSync(join('dist', 'orzmd.browser.js'), join(browserPkgDir, 'orzmd.browser.js'));

console.log(`Bundled orz-markdown@${ORZ_MARKDOWN_VERSION} → dist/orzmd.browser.js (+ browser/)`);
