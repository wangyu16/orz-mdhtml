/**
 * Bundles src/browser-entry.ts (+ orz-markdown and its dependencies) into a
 * single browser IIFE at dist/orzmd.browser.js.
 *
 * This artifact is what makes client-side re-rendering (edit mode) possible.
 * It is either inlined into each .md.html (`--inline`) or published to npm as
 * `orz-mdhtml-browser` and served from jsDelivr (`--cdn`, Delivery C).
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

/** orz-markdown's `exports` hides ./package.json, so find it by walking up. */
function orzPackageJson(): { version: string } {
  let dir = dirname(require.resolve('orz-markdown'));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}
const orzPkg = orzPackageJson();

mkdirSync('dist', { recursive: true });

/** Redirect markdown-it-imsize's fs/dynamic-require image reader to a stub. */
const stubImsizeFsReader = {
  name: 'stub-imsize-fs-reader',
  setup(b: import('esbuild').PluginBuild) {
    b.onResolve({ filter: /(^|[\\/])imsize$/ }, (args) => {
      if (args.importer.includes('markdown-it-imsize')) {
        return { path: join(HERE, 'shims', 'imsize.cjs') };
      }
      return undefined;
    });
  },
};

await build({
  entryPoints: ['src/browser-entry.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  outfile: 'dist/orzmd.browser.js',
  minify: true,
  sourcemap: false,
  plugins: [stubImsizeFsReader],
  // Filesystem-only features (includes, disk image sizing) don't apply in the
  // browser: give `path` a real browser impl and `fs` a graceful stub.
  alias: {
    fs: join(HERE, 'shims', 'fs.cjs'),
    path: 'path-browserify',
  },
  define: {
    __ORZMD_VERSION__: JSON.stringify(orzPkg.version),
    // node-emoji / some deps occasionally branch on process.env.
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

// Also stage the bundle into the orz-mdhtml-browser package (published to CDN).
const browserPkgDir = join(HERE, '..', 'browser');
mkdirSync(browserPkgDir, { recursive: true });
copyFileSync(join('dist', 'orzmd.browser.js'), join(browserPkgDir, 'orzmd.browser.js'));

console.log(`Bundled orz-markdown@${orzPkg.version} → dist/orzmd.browser.js (+ browser/)`);
