#!/usr/bin/env node
/**
 * orz-mdhtml — generate a self-contained, editable .md.html from a .md file.
 *
 * Usage:
 *   orz-mdhtml <input.md> [options]
 *
 * Options:
 *   -o, --out <file>      output path (default: <input>.md.html)
 *   --theme <name>        orz-markdown theme (default: light-neat-3)
 *   --cdn                 reference the renderer from jsDelivr (default; small files)
 *   --inline              embed the renderer bundle in the file (larger, no renderer fetch)
 *   --title <text>        document <title> (default: input filename)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
import { PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { buildHtml, type ThemeEntry } from './template.js';
import {
  DEFAULT_THEME,
  composeInlineMdHtml,
  findAsset,
  orzVersionOf,
  selfVersionOf,
} from './lib.js';

/** orz-markdown's bundled themes (CDN-loaded), with light/dark scheme. */
// Same set, names, and order as the orz-markdown PWA editor's theme menu.
const THEME_DEFS: Array<Omit<ThemeEntry, 'href'>> = [
  { id: 'light-neat-3', name: 'Orchard', scheme: 'light' },
  { id: 'light-neat-1', name: 'Neat', scheme: 'light' },
  { id: 'light-neat-2', name: 'Neat 2', scheme: 'light' },
  { id: 'light-academic-1', name: 'Academic', scheme: 'light' },
  { id: 'light-academic-2', name: 'Academic 2', scheme: 'light' },
  { id: 'beige-decent-1', name: 'Beige', scheme: 'light' },
  { id: 'beige-decent-2', name: 'Beige 2', scheme: 'light' },
  { id: 'light-playful-1', name: 'Playful', scheme: 'light' },
  { id: 'light-playful-2', name: 'Playful 2', scheme: 'light' },
  { id: 'dark-elegant-1', name: 'Dark Elegant', scheme: 'dark' },
  { id: 'dark-elegant-2', name: 'Dark Elegant 2', scheme: 'dark' },
  { id: 'dark-elegant-3', name: 'Nocturne', scheme: 'dark' },
];

const CDN = {
  cm: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16',
};

interface Args {
  input?: string;
  out?: string;
  theme: string;
  delivery: 'inline' | 'cdn';
  title?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { theme: DEFAULT_THEME, delivery: 'cdn' };
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

/** The CDN delivery path — library builds are always inline, so this stays here. */
function buildCdnMdHtml(opts: {
  source: string;
  title: string;
  filename: string;
  docId: string;
  theme: string;
}): string {
  const orzVersion = orzVersionOf();
  const selfVersion = selfVersionOf();

  const appJs = readFileSync(findAsset('app.js'), 'utf8');

  const themeBase = `https://cdn.jsdelivr.net/npm/orz-markdown@${orzVersion}/themes`;
  const themes: ThemeEntry[] = THEME_DEFS.map((t) => ({ ...t, href: `${themeBase}/${t.id}.css` }));
  const defaultTheme = themes.some((t) => t.id === opts.theme) ? opts.theme : themes[0].id;

  const renderer: Parameters<typeof buildHtml>[0]['renderer'] = {
    mode: 'cdn',
    src: `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@${selfVersion}/orzmd.browser.js`,
  };

  return buildHtml({
    source: opts.source,
    title: opts.title,
    filename: opts.filename,
    docId: opts.docId,
    rendererVersion: selfVersion,
    appJs,
    runtimeScript: getBrowserRuntimeScript(),
    renderer,
    versionManifest:
      'https://data.jsdelivr.com/v1/packages/npm/orz-mdhtml-browser/resolved',
    defaultTheme,
    themes,
    frame: {
      katexCss: PREVIEW_CDN.katexCss,
      hljsLightCss: PREVIEW_CDN.hljsLightCss,
      hljsDarkCss: PREVIEW_CDN.hljsDarkCss,
      hljsJs: PREVIEW_CDN.hljsJs,
      mermaidJs: PREVIEW_CDN.mermaidJs,
      smilesJs: PREVIEW_CDN.smilesJs,
      chartJs: PREVIEW_CDN.chartJs,
    },
    editorLibs: {
      codemirrorCss: `${CDN.cm}/codemirror.min.css`,
      codemirrorLightThemeCss: `${CDN.cm}/theme/eclipse.min.css`,
      codemirrorDarkThemeCss: `${CDN.cm}/theme/material-darker.min.css`,
      codemirrorJs: `${CDN.cm}/codemirror.min.js`,
      codemirrorMarkdownJs: `${CDN.cm}/mode/markdown/markdown.min.js`,
      codemirrorContinuelistJs: `${CDN.cm}/addon/edit/continuelist.min.js`,
      morphdomJs: 'https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js',
    },
  });
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

  const composeOpts = {
    source,
    title: args.title ?? base,
    filename: base,
    docId: randomUUID(),
    theme: args.theme,
  };

  let html: string;
  let defaultTheme: string;
  try {
    html =
      args.delivery === 'inline'
        ? composeInlineMdHtml(composeOpts)
        : buildCdnMdHtml(composeOpts);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // Report the theme that was actually applied (unknown → default fallback).
  defaultTheme = THEME_DEFS.some((t) => t.id === args.theme) ? args.theme : THEME_DEFS[0].id;

  writeFileSync(outPath, html, 'utf8');
  console.log(`Wrote ${outPath} (${args.delivery}, theme: ${defaultTheme})`);
}

main();
