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
 *   --cdn                 reference the renderer from jsDelivr (default; small files)
 *   --inline              embed the renderer bundle in the file (larger, no renderer fetch)
 *   --title <text>        document <title> (default: input filename)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, extname, dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
import { buildHtml, type ThemeEntry } from './template.js';

/** orz-markdown's bundled themes (CDN-loaded), with light/dark scheme. */
const THEME_DEFS: Array<Omit<ThemeEntry, 'href'>> = [
  { id: 'light-academic-1', name: 'Academic I', scheme: 'light' },
  { id: 'light-academic-2', name: 'Academic II', scheme: 'light' },
  { id: 'light-neat-1', name: 'Neat I', scheme: 'light' },
  { id: 'light-neat-2', name: 'Neat II', scheme: 'light' },
  { id: 'light-playful-1', name: 'Playful I', scheme: 'light' },
  { id: 'light-playful-2', name: 'Playful II', scheme: 'light' },
  { id: 'beige-decent-1', name: 'Decent I', scheme: 'light' },
  { id: 'beige-decent-2', name: 'Decent II', scheme: 'light' },
  { id: 'dark-elegant-1', name: 'Elegant I', scheme: 'dark' },
  { id: 'dark-elegant-2', name: 'Elegant II', scheme: 'dark' },
];

const CDN = {
  hl: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0',
  cm: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16',
};

const require = createRequire(import.meta.url);

/** orz-markdown's `exports` hides ./package.json, so find it by walking up. */
function orzVersionOf(): string {
  let dir = dirname(require.resolve('orz-markdown'));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version;
}
const orzVersion = orzVersionOf();

const HERE = dirname(fileURLToPath(import.meta.url));

/** orz-mdhtml's own version — pins the renderer bundle + version check. */
function selfVersionOf(): string {
  for (const p of [join(HERE, '..', 'package.json'), join(HERE, '..', '..', 'package.json')]) {
    try {
      const j = JSON.parse(readFileSync(p, 'utf8')) as { name?: string; version?: string };
      if (j.name === 'orz-mdhtml' && j.version) return j.version;
    } catch {
      /* keep looking */
    }
  }
  return '0.0.0';
}
const selfVersion = selfVersionOf();
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
  const a: Args = { theme: 'light-academic-1', delivery: 'cdn' };
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

  const appJs = readFileSync(findAsset('app.js'), 'utf8');

  const themeBase = `https://cdn.jsdelivr.net/npm/orz-markdown@${orzVersion}/themes`;
  const themes: ThemeEntry[] = THEME_DEFS.map((t) => ({ ...t, href: `${themeBase}/${t.id}.css` }));
  const defaultTheme = themes.some((t) => t.id === args.theme) ? args.theme : themes[0].id;

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
      src: `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@${selfVersion}/orzmd.browser.js`,
    };
  }

  const html = buildHtml({
    source,
    title: args.title ?? base,
    filename: base,
    docId: randomUUID(),
    rendererVersion: selfVersion,
    appJs,
    runtimeScript: getBrowserRuntimeScript(),
    renderer,
    versionManifest:
      'https://data.jsdelivr.com/v1/packages/npm/orz-mdhtml-browser/resolved',
    defaultTheme,
    themes,
    frame: {
      katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
      hljsLightCss: `${CDN.hl}/styles/github.min.css`,
      hljsDarkCss: `${CDN.hl}/styles/atom-one-dark.min.css`,
      hljsJs: `${CDN.hl}/highlight.min.js`,
      mermaidJs: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    },
    editorLibs: {
      codemirrorCss: `${CDN.cm}/codemirror.min.css`,
      codemirrorLightThemeCss: `${CDN.cm}/theme/eclipse.min.css`,
      codemirrorDarkThemeCss: `${CDN.cm}/theme/material-darker.min.css`,
      codemirrorJs: `${CDN.cm}/codemirror.min.js`,
      codemirrorMarkdownJs: `${CDN.cm}/mode/markdown/markdown.min.js`,
      codemirrorContinuelistJs: `${CDN.cm}/addon/edit/continuelist.min.js`,
      splitJs: 'https://cdnjs.cloudflare.com/ajax/libs/split.js/1.6.5/split.min.js',
      morphdomJs: 'https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js',
    },
  });

  writeFileSync(outPath, html, 'utf8');
  console.log(`Wrote ${outPath} (${args.delivery}, theme: ${defaultTheme})`);
}

main();
