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
import {
  DEFAULT_THEME,
  composeInlineMdHtml,
} from './lib.js';

const THEME_IDS = new Set([
  'light-neat-3',
  'light-neat-1',
  'light-neat-2',
  'light-academic-1',
  'light-academic-2',
  'beige-decent-1',
  'beige-decent-2',
  'light-playful-1',
  'light-playful-2',
  'dark-elegant-1',
  'dark-elegant-2',
  'dark-elegant-3',
]);

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
    html = composeInlineMdHtml({ ...composeOpts, delivery: args.delivery });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // Report the theme that was actually applied (unknown → default fallback).
  defaultTheme = THEME_IDS.has(args.theme) ? args.theme : DEFAULT_THEME;

  writeFileSync(outPath, html, 'utf8');
  console.log(`Wrote ${outPath} (${args.delivery}, theme: ${defaultTheme})`);
}

main();
