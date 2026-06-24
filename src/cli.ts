#!/usr/bin/env node
/**
 * orz-mdhtml — generate a self-contained, editable .md.html from a .md file.
 *
 * Usage:
 *   orz-mdhtml <input.md> [options]
 *
 * Options:
 *   -o, --out <file>      output path (default: <input>.md.html)
 *   --theme <name>        orz-markdown theme (default: light-academic-1)
 *   --inline              embed the renderer bundle in the file (offline; default)
 *   --cdn                 reference the renderer from jsDelivr (Delivery C)
 *   --title <text>        document <title> (default: input filename)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, extname, dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { md } from 'orz-markdown';
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
import { buildHtml } from './template.js';

const require = createRequire(import.meta.url);

/** orz-markdown's `exports` hides ./package.json, so find it by walking up. */
function orzVersionOf(): string {
  let dir = dirname(require.resolve('orz-markdown'));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version;
}
const orzVersion = orzVersionOf();

const HERE = dirname(fileURLToPath(import.meta.url));
// assets/ sits next to dist/ when published, and next to src/ in dev.
function findAsset(name: string): string {
  for (const p of [join(HERE, '..', 'assets', name), join(HERE, '..', '..', 'assets', name)]) {
    if (existsSync(p)) return p;
  }
  throw new Error(`asset not found: ${name}`);
}

interface Args {
  input?: string;
  out?: string;
  theme: string;
  delivery: 'inline' | 'cdn';
  title?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { theme: 'light-academic-1', delivery: 'inline' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-o' || arg === '--out') a.out = argv[++i];
    else if (arg === '--theme') a.theme = argv[++i];
    else if (arg === '--inline') a.delivery = 'inline';
    else if (arg === '--cdn') a.delivery = 'cdn';
    else if (arg === '--title') a.title = argv[++i];
    else if (!arg.startsWith('-')) a.input = arg;
  }
  return a;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: orz-mdhtml <input.md> [-o out] [--theme name] [--inline|--cdn]');
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  const source = readFileSync(inputPath, 'utf8');
  const base = basename(inputPath, extname(inputPath));
  const outPath = args.out ? resolve(args.out) : join(dirname(inputPath), `${base}.md.html`);

  const renderedBody = md.render(source);
  const appJs = readFileSync(findAsset('app.js'), 'utf8');

  const themeHref =
    `https://cdn.jsdelivr.net/npm/orz-markdown@${orzVersion}/themes/${args.theme}.css`;

  // Renderer delivery.
  let renderer: Parameters<typeof buildHtml>[0]['renderer'];
  if (args.delivery === 'inline') {
    // dist/cli.js (published) → sibling; src/cli.ts (dev) → ../dist.
    const bundlePath = [
      join(HERE, 'orzmd.browser.js'),
      join(HERE, '..', 'dist', 'orzmd.browser.js'),
    ].find(existsSync);
    if (!bundlePath) {
      console.error('Inline mode needs the browser bundle. Run: npm run bundle');
      process.exit(1);
    }
    renderer = { mode: 'inline', js: readFileSync(bundlePath, 'utf8') };
  } else {
    renderer = {
      mode: 'cdn',
      src: `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@${orzVersion}/orzmd.browser.js`,
    };
  }

  const html = buildHtml({
    source,
    renderedBody,
    title: args.title ?? base,
    filename: base,
    themeHref,
    rendererVersion: orzVersion,
    appJs,
    runtimeScript: getBrowserRuntimeScript(),
    renderer,
    versionManifest:
      'https://data.jsdelivr.com/v1/packages/npm/orz-mdhtml-browser/resolved',
  });

  writeFileSync(outPath, html, 'utf8');
  console.log(`Wrote ${outPath} (${args.delivery}, theme: ${args.theme})`);
}

main();
