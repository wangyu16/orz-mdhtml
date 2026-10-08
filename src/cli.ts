#!/usr/bin/env node
/**
 * The orz-mdhtml CLI (FC-10; REBUILD §3a): text twins (`x.md`) and their
 * self-editing files (`x.md.html`, FC-18 text format 1).
 *
 *   orz-mdhtml new [file.md] [--title T] [--theme id] [--measure m] [--lang l] [--html] [--cdn]
 *   orz-mdhtml assemble <file.md> [-o out] [--cdn] [--resolve-includes | --no-includes]   (also: orz-mdhtml <file.md>)
 *   orz-mdhtml extract <file.md.html> [-o out]
 *   orz-mdhtml upgrade <old.md.html> [-o out] [--text out.md | --no-text] [--cdn | --inline]
 *   orz-mdhtml inspect <file> [--json]
 *
 * Inline delivery is the default (FD-02); `--cdn` loads the engine from
 * jsDelivr (web publishing). Content — title, theme, measure, language,
 * metadata — comes only from the text's header: `assemble` has no content
 * options. Every command takes `--json` (one JSON object on stdout, for
 * agents), `--help`; exit status 0 = done, 1 = refused or failed, 2 = usage.
 * Files are never overwritten when that could lose work (see `--force`).
 */
import { chmodSync, copyFileSync, existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { decodeText, kindFromFilename, twinName, type Lint } from 'orz-markdown/carrier';
import { compareSemver } from 'orz-markdown/carrier/shell';
import { storedText } from './assemble.js';
import { keepReferenced, resolveFileIncludes, unresolvedIncludes } from './includes.js';
import { earlierStateOf, rememberPair, type EarlierState } from './known-states.js';
import { assemble, extract, inspect, newDocument, readDocument, readLegacy, upgrade, DEFAULT_THEME, ORZ_MARKDOWN_VERSION, THEMES, MEASURES, VERSION, type InspectReport } from './lib.js';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

/** An expected failure: printed as a message (or `{ ok: false }` with --json), never as a stack. */
class CliError extends Error {
  constructor(message: string, readonly code: number = EXIT_FAILED) { super(message); }
}

// ── help ────────────────────────────────────────────────────────────────────

const USAGE = `orz-mdhtml ${VERSION} — Markdown that edits itself.
A document is its text twin (x.md); its self-editing file (x.md.html) is assembled from it.

Usage:
  orz-mdhtml new [file.md] [--title T] [--theme id] [--measure m] [--lang l] [--html] [--cdn]
  orz-mdhtml assemble <file.md> [-o out.md.html] [--cdn] [--resolve-includes | --no-includes]
  orz-mdhtml <file.md> [-o out.md.html] [--cdn]          same as assemble
  orz-mdhtml extract <file.md.html> [-o out.md]
  orz-mdhtml upgrade <old.md.html> [-o out.md.html] [--text out.md | --no-text] [--cdn | --inline]
  orz-mdhtml inspect <file> [--json]
  orz-mdhtml themes

Commands:
  new        write a new text twin (header with a fresh uid); --html also assembles it;
             without a file the text goes to stdout
  assemble   write the .md.html of a text twin (x.md -> x.md.html); inline by default;
             keeps the includes the existing file holds
  extract    write the exact text twin of a .md.html (x.md.html -> x.md)
  upgrade    turn an old file (0.x, or an older 1.x shell) into a file of this version,
             in place by default, and write its text twin (x.md) unless --no-text
  inspect    diagnose a text or a file: kind, format, shell, delivery, uid, lint, advice
  themes     list the theme ids a header may name

Options:
  -o, --out <path>  output path ("-" = stdout for assemble and extract)
  --cdn             load the engine from jsDelivr (small files, for the web); default: inline
  --inline          the default delivery: the engine inside the file (no engine download)
  --force           overwrite even when that could lose work (see below); the replaced
                    file is kept as <file>~
  --json            print one JSON object (the result, or {"ok": false, "error"}) for agents
  -h, --help        help (also: orz-mdhtml <command> --help)
  -v, --version     the version

Content (title, theme, measure, lang, metadata) comes only from the text's {{nyml}} header;
assemble has no content options. Without --force nothing is overwritten that could hold
other work: an output that is not an orz file, a .md.html that holds a different text
than the one assembled (unless that text is an earlier state of x.md: its last commit or
staged version in git, or what orz-mdhtml itself last wrote there), a text twin changed
after its file, another document (upgrade -o), or (new) any existing file. Before editing
x.md, \`orz-mdhtml inspect x.md\` says whether x.md.html holds newer work (saved in the
browser); \`orz-mdhtml extract x.md.html\` first brings it in.
Exit status: 0 done, 1 refused or failed, 2 usage error.`;

const HELP: Record<string, string> = {
  new: `orz-mdhtml new [file.md] [--title T] [--theme id] [--measure normal|wide|full] [--lang l] [--html] [--cdn] [--force] [--json]

Writes a new format-1 text twin: a header (kind: document, carrier: md, a fresh uid,
the given title/theme/measure/lang), then a starter body. Without a file the text is
printed to stdout. --html also writes its assembled file (file.md.html; --cdn for a
small web file). Refuses to overwrite an existing file unless --force.
Themes: ${THEMES.map((t) => t.id).join(', ')}.`,
  assemble: `orz-mdhtml assemble <file.md> [-o out.md.html] [--cdn] [--resolve-includes | --no-includes] [--force] [--json]
orz-mdhtml <file.md> [-o out.md.html] [--cdn] [--force] [--json]

Writes the self-editing file of a text twin: x.md -> x.md.html (FC-18 §3), the text
stored exactly (line endings, BOM). Inline by default (this release's engine inside the
file); --cdn loads it from jsDelivr. Everything about the document — title, theme,
measure, lang, metadata — comes from the text's header; there are no content options.

Includes ({{md part.md}}, {{md https://…}}): a file shows an include only from the
record it holds (#orz-includes). The record of the existing output is kept (for the
directives the text still has); --no-includes drops it. --resolve-includes reads the
file includes from the text's folder (never outside it) and records them. Directives
left unresolved are reported as warnings.

Replacing x.md.html (no --force needed) when it holds:
  - the same text, or
  - an earlier state of x.md: its last commit (git show HEAD:x.md) or its staged version,
    when x.md is tracked in git; or the text orz-mdhtml itself last wrote into x.md.html
    or read out of it (assemble, extract, new --html, upgrade; recorded by hash in
    $XDG_CACHE_HOME/orz-mdhtml or ~/.cache/orz-mdhtml).
So the normal loop — edit x.md, assemble, edit, assemble — needs no --force.
Refuses (unless --force) to replace an output that is not an orz file, or a .md.html
holding any other text — it may hold work saved in the browser:
\`orz-mdhtml extract x.md.html -o other.md\` and merge first (or, before editing x.md,
\`orz-mdhtml extract x.md.html\`). When the text has everything, --force replaces it and
keeps the old file as x.md.html~.`,
  extract: `orz-mdhtml extract <file.md.html> [-o out.md] [--force] [--json]

Writes the exact text twin of an assembled file: x.md.html -> x.md, byte for byte the
text that was assembled (CR LF and BOM kept). A 0.x file (before text format 1) is
refused: use \`orz-mdhtml upgrade <file>\`, which writes its format-1 text twin.
Refuses (unless --force) to overwrite a text twin that differs and was changed after
the file (--force keeps it as x.md~). Warns when the file was cut off (the text may be
incomplete).`,
  upgrade: `orz-mdhtml upgrade <old.md.html> [-o out.md.html] [--text out.md | --no-text] [--cdn | --inline] [--force] [--json]

Turns an orz-mdhtml file into a file of this version. A 0.x file: its source is kept
exactly and its metadata, title and theme move into a format-1 header (with carrier: md
and a uid). A format-1 file: re-assembled with this shell, text and includes unchanged.
Writes the file in place (or to -o) and its text twin (twin of the output, or --text;
--no-text skips it). Keeps the old file's delivery (--cdn / --inline to choose). Also
repairs a damaged shell or engine (the text must be intact).
Refuses (unless --force) a file whose shell is newer than this tool (a downgrade), -o
onto another document, and an existing text twin that differs; --force keeps a replaced
file as <file>~.`,
  inspect: `orz-mdhtml inspect <file> [--json]

Diagnoses a text twin, an assembled file, a 0.x file or any HTML: kind, text format,
shell version and how it compares to this tool, delivery, uid, title, theme, header
keys, includes, header lint, the file's structure (island, end, engine), whether its
sibling twin (x.md <-> x.md.html) holds the same text and which is newer, and advice
(the commands to run). Human-readable by default; --json prints the report object.`,
  themes: `orz-mdhtml themes [--json]

Lists the theme ids a header's \`theme\` key may name (default first).`,
};

// ── arguments ───────────────────────────────────────────────────────────────

type Spec = Record<string, 'value' | 'flag'>;

interface Parsed {
  positional: string[];
  values: Record<string, string>;
  flags: Set<string>;
}

const COMMON: Spec = { '--json': 'flag', '--help': 'flag', '-h': 'flag', '--force': 'flag' };
const ALIASES: Record<string, string> = { '-o': '--out', '-h': '--help' };
const SPECS: Record<string, Spec> = {
  new: { ...COMMON, '--title': 'value', '--theme': 'value', '--measure': 'value', '--lang': 'value', '--html': 'flag', '--cdn': 'flag', '--inline': 'flag' },
  assemble: { ...COMMON, '--out': 'value', '-o': 'value', '--cdn': 'flag', '--inline': 'flag', '--resolve-includes': 'flag', '--no-includes': 'flag' },
  extract: { ...COMMON, '--out': 'value', '-o': 'value' },
  upgrade: { ...COMMON, '--out': 'value', '-o': 'value', '--text': 'value', '--no-text': 'flag', '--cdn': 'flag', '--inline': 'flag' },
  inspect: { ...COMMON },
  themes: { ...COMMON },
};
/** Options of 0.x `orz-mdhtml <file.md>` that set content: removed, the header holds it. */
const CONTENT_OPTIONS = ['--theme', '--title', '--measure', '--lang', '--author', '--uid'];

function parse(command: string, argv: string[]): Parsed {
  const spec = SPECS[command];
  const out: Parsed = { positional: [], values: {}, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (raw === '--') { out.positional.push(...argv.slice(i + 1)); break; }
    if (!raw.startsWith('-') || raw === '-') { out.positional.push(raw); continue; }
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const name = eq > 0 ? raw.slice(0, eq) : raw;
    const kind = spec[name];
    const key = ALIASES[name] ?? name;
    if (!kind) {
      if (command === 'assemble' && CONTENT_OPTIONS.includes(name)) {
        const what = name.slice(2);
        throw new CliError(
          `${name} is not an assemble option: since 1.0 the ${what} comes from the text itself. `
          + `Put \`${what}: …\` in the {{nyml}} header at the top of the text (or create the text with \`orz-mdhtml new ${name} …\`), then assemble again.`,
          EXIT_USAGE,
        );
      }
      throw new CliError(`unknown option ${name} for \`orz-mdhtml ${command}\` (see \`orz-mdhtml ${command} --help\`)`, EXIT_USAGE);
    }
    if (kind === 'flag') {
      if (eq > 0) throw new CliError(`${name} takes no value`, EXIT_USAGE);
      out.flags.add(key);
    } else {
      const value = eq > 0 ? raw.slice(eq + 1) : argv[++i];
      if (value === undefined || (eq < 0 && value.startsWith('-') && value !== '-')) throw new CliError(`${name} needs a value`, EXIT_USAGE);
      out.values[key] = value;
    }
  }
  if (out.flags.has('--cdn') && out.flags.has('--inline')) throw new CliError('--cdn and --inline exclude each other', EXIT_USAGE);
  return out;
}

const one = (p: Parsed, what: string, command: string): string => {
  if (p.positional.length === 0) throw new CliError(`\`orz-mdhtml ${command}\` needs ${what} (see \`orz-mdhtml ${command} --help\`)`, EXIT_USAGE);
  if (p.positional.length > 1) throw new CliError(`\`orz-mdhtml ${command}\` takes one ${what}, got ${p.positional.length}: ${p.positional.join(' ')}`, EXIT_USAGE);
  return p.positional[0];
};

// ── files ───────────────────────────────────────────────────────────────────

/** Read a file as text exactly (UTF-8, BOM kept, invalid UTF-8 refused; FC-18 §3 `decodeText`). */
function readText(path: string): string {
  let bytes: Buffer;
  try { bytes = readFileSync(path); } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw new CliError(code === 'ENOENT' ? `${path}: no such file` : code === 'EISDIR' ? `${path} is a folder` : `${path}: ${(e as Error).message}`);
  }
  try { return decodeText(bytes, { fatal: true }); } catch { throw new CliError(`${path} is not valid UTF-8`); }
}

/**
 * Write a file atomically (a temporary file next to it, then rename), so a
 * failure never leaves half a file. An existing file keeps its mode, and a
 * symbolic link stays a link: the file it points to is replaced.
 */
function writeOut(path: string, data: string): void {
  let target = path;
  let mode: number | undefined;
  if (existsSync(path)) {
    try {
      target = realpathSync(path);
      mode = statSync(target).mode & 0o7777;
    } catch { /* replaced as named */ }
  }
  const tmp = join(dirname(target), `.${basename(target)}.orz-${process.pid}.tmp`);
  try {
    writeFileSync(tmp, data, { encoding: 'utf8', ...(mode !== undefined ? { mode } : {}) });
    if (mode !== undefined) chmodSync(tmp, mode); // the umask does not narrow it
    renameSync(tmp, target);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* not created */ }
    throw new CliError(`could not write ${path}: ${(e as Error).message}`);
  }
}

/** Keep a copy of a file about to be replaced with --force: `<file>~`. */
function backup(path: string, o: Io): string {
  const to = `${path}~`;
  try { copyFileSync(path, to); } catch (e) { throw new CliError(`could not keep a copy of ${path} as ${to}: ${(e as Error).message}; nothing was written`); }
  o.warn(`replaced ${path} (--force); the old file is kept as ${to}`);
  return to;
}

const mtime = (path: string): number => statSync(path).mtimeMs;
const looksHtml = (s: string): boolean => /^\uFEFF?\s*(?:<!doctype\s+html|<html[\s>])/i.test(s.slice(0, 1024));

/** The text an existing orz file holds (format 1 or 0.x), or null when it is not one. */
function documentTextOf(html: string): string | null {
  const ex = extract(html);
  if (ex) return ex.text;
  return readLegacy(html)?.text ?? null;
}

/** An existing file as text, or null when it is not valid UTF-8. */
function readMaybe(path: string): string | null {
  try { return readText(path); } catch { return null; }
}

/** Where an earlier state of the twin was found (the human line after "Wrote …"). */
const EARLIER_SOURCE: Record<EarlierState, string> = {
  'git-head': 'its last commit',
  'git-index': 'its staged version',
  cache: 'the text orz-mdhtml last wrote or read for this pair',
};

/**
 * Whether `out` (an existing assembled file) may be replaced by the assembly
 * of `text` read from `input` (claims T.7, T.11):
 *
 * - it holds the same text (as a new file would store it): yes;
 * - it holds an earlier state of the twin `input` — its last commit or its
 *   staged version in git, or the text this CLI itself last wrote into it or
 *   read out of it (src/known-states.ts): yes, without `--force` (`earlier`);
 * - it is not an orz file, or holds any other text — whichever file is
 *   newer (it may hold work saved in the browser that the text lacks): no
 *   (`risk`), unless `--force`, which keeps it as `<file>~`.
 */
function assembledOutputCheck(out: string, existing: string | null, input: string, text: string): { risk: string | null; earlier: EarlierState | null } {
  const held = existing !== null && looksHtml(existing) ? documentTextOf(existing) : null;
  if (held === null) return { risk: `${out} exists and is not an orz file; not replaced (pass --force to replace it, or -o another path)`, earlier: null };
  if (held === storedText(text)) return { risk: null, earlier: null };
  const earlier = earlierStateOf(input, out, held, storedText);
  if (earlier !== null) return { risk: null, earlier };
  const outName = basename(out);
  const inName = basename(input);
  const later = mtime(out) > mtime(input) ? ` and was changed after it (saved in the browser?)` : '';
  return {
    risk: `${outName} holds a different text than ${inName}${later} — not its last commit, nor the text orz-mdhtml last wrote there; not replaced. If it has changes ${inName} lacks, bring them in first: \`orz-mdhtml extract ${outName} -o ${inName.replace(/\.md$/, '')}.browser.md\`, then merge. When ${inName} has everything, run again with --force (the old file is kept as ${outName}~)`,
    earlier: null,
  };
}

/**
 * Why the text twin `out` must not be replaced by `text`, or null: it differs
 * and (when `newerThan` is given) changed after that file.
 */
function textOutputRisk(out: string, text: string, newerThan: string | null, advice: string): string | null {
  if (!existsSync(out)) return null;
  const existing = readMaybe(out);
  if (existing === text) return null;
  if (newerThan === null || mtime(out) > mtime(newerThan)) return `${out} exists and holds a different text${newerThan ? `, changed after ${newerThan}` : ''}; not overwritten. ${advice}`;
  return null;
}

/** Refuse a risk, or with --force keep a copy of what is replaced. */
function guard(path: string, risk: string | null, force: boolean, o: Io): void {
  if (risk === null) return;
  if (!force) throw new CliError(risk);
  backup(path, o);
}

const errors = (lint: Lint[]): string[] => lint.filter((l) => l.level === 'error').map((l) => `header: ${l.message} (${l.code}${l.line ? `, line ${l.line}` : ''})`);
const warnings = (lint: Lint[]): string[] => lint.filter((l) => l.level === 'warning').map((l) => `header: ${l.message} (${l.code}${l.line ? `, line ${l.line}` : ''})`);

// ── output ──────────────────────────────────────────────────────────────────

interface Io {
  json: boolean;
  /** Human lines (stdout). */
  say(line: string): void;
  /** Warnings (stderr; in --json mode they go into the result instead). */
  warn(line: string): void;
  warned: string[];
}

function io(json: boolean): Io {
  const warned: string[] = [];
  return {
    json,
    warned,
    say(line) { if (!json) process.stdout.write(`${line}\n`); },
    warn(line) { warned.push(line); if (!json) process.stderr.write(`orz-mdhtml: warning: ${line}\n`); },
  };
}

const emit = (o: Io, result: Record<string, unknown>): void => {
  if (o.json) process.stdout.write(`${JSON.stringify({ ok: true, ...result, warnings: o.warned }, null, 2)}\n`);
};

const delivery = (p: Parsed, fallback: 'inline' | 'cdn' = 'inline'): 'inline' | 'cdn' => (p.flags.has('--cdn') ? 'cdn' : p.flags.has('--inline') ? 'inline' : fallback);

// ── commands ────────────────────────────────────────────────────────────────

function cmdNew(p: Parsed, o: Io): void {
  if (p.positional.length > 1) throw new CliError(`\`orz-mdhtml new\` takes at most one file, got ${p.positional.length}`, EXIT_USAGE);
  const file = p.positional[0];
  const force = p.flags.has('--force');
  let text: string;
  try {
    text = newDocument({
      ...(p.values['--title'] !== undefined ? { title: p.values['--title'] } : {}),
      ...(p.values['--theme'] !== undefined ? { theme: p.values['--theme'] } : {}),
      ...(p.values['--measure'] !== undefined ? { measure: p.values['--measure'] as (typeof MEASURES)[number] } : {}),
      ...(p.values['--lang'] !== undefined ? { lang: p.values['--lang'] } : {}),
    });
  } catch (e) {
    throw new CliError(`${(e as Error).message.replace(/^orz-mdhtml: /, '')}${/theme/.test((e as Error).message) ? ` (themes: ${THEMES.map((t) => t.id).join(', ')})` : ''}`, EXIT_USAGE);
  }
  const info = readDocument(text);
  const facts = { kind: 'md', format: info.format, uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null };
  if (!file) {
    if (p.flags.has('--html')) throw new CliError('--html needs a file name (orz-mdhtml new notes.md --html)', EXIT_USAGE);
    if (o.json) emit(o, { command: 'new', file: null, html: null, ...facts, text });
    else process.stdout.write(text);
    return;
  }
  const path = resolve(file);
  const k = kindFromFilename(path);
  if (k !== 'md' || path.endsWith('.md.html')) {
    throw new CliError(k === 'slides' || k === 'paged' ? `${file} names an orz ${k} document: use orz-${k}` : `${file}: a text twin's name ends in .md (e.g. notes.md)`, EXIT_USAGE);
  }
  const htmlPath = p.flags.has('--html') ? twinName(path)! : null;
  if (!force) {
    for (const f of [path, htmlPath]) if (f && existsSync(f)) throw new CliError(`${f} already exists; not overwritten (pass --force to replace it)`);
  }
  const html = htmlPath ? assemble(text, { delivery: delivery(p) }) : null;
  writeOut(path, text);
  o.say(`Wrote ${path}`);
  if (htmlPath && html !== null) {
    writeOut(htmlPath, html);
    rememberPair(path, htmlPath, storedText(text));
    o.say(`Wrote ${htmlPath} (${delivery(p)})`);
  }
  emit(o, { command: 'new', file: path, html: htmlPath, ...facts, ...(htmlPath ? { delivery: delivery(p), shell: VERSION } : {}) });
}

function cmdAssemble(p: Parsed, o: Io): void {
  const file = one(p, 'a text file (file.md)', 'assemble');
  const input = resolve(file);
  const kind = kindFromFilename(input);
  if (kind === 'slides' || kind === 'paged') throw new CliError(`${file} is an orz ${kind} text: use orz-${kind}`);
  if (p.flags.has('--resolve-includes') && p.flags.has('--no-includes')) throw new CliError('--resolve-includes and --no-includes exclude each other', EXIT_USAGE);
  const text = readText(input);
  if (looksHtml(text) && documentTextOf(text) !== null) {
    throw new CliError(`${file} is an assembled file, not a text: \`orz-mdhtml extract ${file}\` gives its text; \`orz-mdhtml upgrade ${file}\` re-assembles it with this version`);
  }
  const outArg = p.values['--out'];
  const toStdout = outArg === '-';
  if (toStdout && o.json) throw new CliError('-o - (stdout) and --json exclude each other', EXIT_USAGE);
  const out = toStdout ? null : outArg !== undefined ? resolve(outArg) : (kind === 'md' && !input.endsWith('.md.html') ? twinName(input) : null);
  if (!toStdout && out === null) throw new CliError(`cannot name the output of ${file} (a text twin's name ends in .md): pass -o out.md.html`, EXIT_USAGE);
  if (out === input) throw new CliError('the output would overwrite the input', EXIT_USAGE);
  const info = readDocument(text);
  if (info.kind !== 'md' && kind === null) throw new CliError(`${file}: the header says carrier: ${info.kind}; use orz-${info.kind}`);
  const d = delivery(p);
  const force = p.flags.has('--force');

  // the existing output: may it be replaced, and which includes does it hold?
  const exists = out !== null && existsSync(out);
  const existing = exists ? readMaybe(out!) : null;
  const check = exists ? assembledOutputCheck(out!, existing, input, text) : { risk: null, earlier: null };
  const risk = check.risk;
  if (risk !== null && !force) throw new CliError(risk);

  // includes (FC-18 §8.3): the existing file's record, kept for the directives the text still has
  let includes: Record<string, string> = {};
  if (!p.flags.has('--no-includes') && existing !== null && looksHtml(existing)) {
    const held = extract(existing)?.includes;
    if (held) includes = keepReferenced(text, held);
  }
  let resolved = 0;
  if (p.flags.has('--resolve-includes')) {
    const r = resolveFileIncludes(text, dirname(input));
    for (const problem of r.problems) o.warn(`include not resolved: ${problem}`);
    for (const key of Object.keys(includes)) if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(key)) delete includes[key]; // files are read afresh
    includes = { ...includes, ...r.includes };
    resolved = Object.keys(r.includes).length;
  }
  for (const target of unresolvedIncludes(text, includes)) {
    o.warn(`{{md ${target}}} is not resolved: the file shows nothing there (${/^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? 'a URL include is shown only by a host that resolves it, or from the record of a file that holds it' : 'pass --resolve-includes to read it from the text\'s folder'})`);
  }

  let html: string;
  try { html = assemble(text, { delivery: d, ...(Object.keys(includes).length ? { includes } : {}) }); } catch (e) { throw new CliError(`${file}: ${(e as Error).message.replace(/^orz-mdhtml: /, '')}`); }
  for (const w of errors(info.lint)) o.warn(w);
  for (const w of warnings(info.lint)) o.warn(w);
  if (toStdout) { process.stdout.write(html); return; }
  const backedUp = risk !== null ? backup(out!, o) : null;
  writeOut(out!, html);
  rememberPair(input, out!, storedText(text));
  const n = Object.keys(includes).length;
  o.say(`Wrote ${out} (${d}, orz-mdhtml ${VERSION}${n ? `, ${n} include${n === 1 ? '' : 's'}` : ''})`);
  if (check.earlier !== null) o.say(`  (it held an earlier text of ${basename(input)}: ${EARLIER_SOURCE[check.earlier]})`);
  emit(o, { command: 'assemble', input, output: out, kind: 'md', format: info.format, shell: VERSION, delivery: d, uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null, includes: n, resolved, backup: backedUp, replaced: check.earlier, bytes: Buffer.byteLength(html, 'utf8') });
}

function cmdExtract(p: Parsed, o: Io): void {
  const file = one(p, 'an assembled file (file.md.html)', 'extract');
  const input = resolve(file);
  const html = readText(input);
  const legacy = readLegacy(html);
  const ex = legacy ? null : extract(html);
  if (legacy) {
    throw new CliError(`${file} is an orz-mdhtml ${legacy.version ?? '0.x'} file (before text format 1): run \`orz-mdhtml upgrade ${file}\` — it writes the format-1 text twin (the source exactly, metadata moved into the header) and a file of this version`);
  }
  if (!ex) throw new CliError(`${file} holds no orz document (no #orz-src island); \`orz-mdhtml inspect ${file}\` says what it is`);
  if (ex.shell === '') o.warn(`${file} has an #orz-src island but no #orz-shell: an unknown writer; the island was read as format 1 would be — check the text`);
  else if (inspect(html).checks?.island === 'unclosed') o.warn(`${file} was cut off: its #orz-src island is not closed, so the text may be incomplete — compare it with a backup before relying on it`);
  const outArg = p.values['--out'];
  const toStdout = outArg === '-';
  if (toStdout && o.json) throw new CliError('-o - (stdout) and --json exclude each other', EXIT_USAGE);
  if (toStdout) { process.stdout.write(ex.text); return; }
  const out = outArg !== undefined ? resolve(outArg) : twinName(input);
  if (out === null) throw new CliError(`cannot name the text twin of ${file} (an assembled file's name ends in .md.html): pass -o out.md`, EXIT_USAGE);
  if (out === input) throw new CliError('the output would overwrite the input', EXIT_USAGE);
  const risk = textOutputRisk(out, ex.text, input, `Its changes would be lost: merge them by hand, -o another path, or pass --force (the old text is kept as ${basename(out)}~)`);
  guard(out, risk, p.flags.has('--force'), o);
  writeOut(out, ex.text);
  rememberPair(out, input, ex.text);
  const info = readDocument(ex.text, { kind: ex.kind });
  o.say(`Wrote ${out} (${ex.kind}, text format ${ex.format}, from orz-${ex.kind === 'md' ? 'mdhtml' : ex.kind} ${ex.shell || 'unknown'})`);
  emit(o, { command: 'extract', input, output: out, kind: ex.kind, format: ex.format, shell: ex.shell || null, delivery: ex.delivery || null, uid: info.meta.uid ?? null, title: info.title, includes: ex.includes ? Object.keys(ex.includes).length : 0, backup: risk !== null ? `${out}~` : null, bytes: Buffer.byteLength(ex.text, 'utf8') });
}

function cmdUpgrade(p: Parsed, o: Io): void {
  const file = one(p, 'a file (old.md.html)', 'upgrade');
  const input = resolve(file);
  const html = readText(input);
  const legacy = readLegacy(html);
  const ex = legacy ? null : extract(html);
  const oldDelivery: 'inline' | 'cdn' = legacy ? (legacy.delivery ?? 'inline') : ex?.delivery === 'cdn' ? 'cdn' : 'inline';
  const d = delivery(p, oldDelivery);
  const force = p.flags.has('--force');
  let r: ReturnType<typeof upgrade>;
  try { r = upgrade(html, { delivery: d, ...(force ? { downgrade: true } : {}) }); } catch (e) { throw new CliError(`${file}: ${(e as Error).message.replace(/^orz-mdhtml( upgrade)?: /, '')}`); }
  const out = p.values['--out'] !== undefined ? resolve(p.values['--out']) : input;
  if (p.flags.has('--no-text') && p.values['--text'] !== undefined) throw new CliError('--text and --no-text exclude each other', EXIT_USAGE);
  const textOut = p.flags.has('--no-text') ? null : p.values['--text'] !== undefined ? resolve(p.values['--text']) : twinName(out);
  if (!p.flags.has('--no-text') && textOut === null) throw new CliError(`cannot name the text twin of ${out}: pass --text out.md (or --no-text)`, EXIT_USAGE);
  if (textOut === out || textOut === input) throw new CliError('the text twin would overwrite the file', EXIT_USAGE);
  // check every output before writing any
  let outRisk: string | null = null;
  if (out !== input && existsSync(out)) {
    const existing = readMaybe(out);
    const held = existing !== null && looksHtml(existing) ? documentTextOf(existing) : null;
    if (held === null) outRisk = `${out} exists and is not an orz file; not overwritten (pass --force, or -o another path)`;
    else if (held !== r.text) outRisk = `${out} exists and holds another text; not overwritten (pass --force, or -o another path)`;
  }
  const textRisk = textOut ? textOutputRisk(textOut, r.text, null, `Pass --text another.md, --no-text, or --force to replace it (the old text is kept as ${basename(textOut)}~)`) : null;
  if (!force) for (const risk of [outRisk, textRisk]) if (risk !== null) throw new CliError(risk);
  guard(out, outRisk, force, o);
  if (textOut) guard(textOut, textRisk, force, o);
  if (r.from === 'format-1' && ex && compareSemver(ex.shell, VERSION) === 1) o.warn(`${file} had a newer shell (orz-mdhtml ${ex.shell}); --force re-assembled it with this older one (${VERSION})`);
  writeOut(out, r.html);
  if (textOut) { writeOut(textOut, r.text); rememberPair(textOut, out, extract(r.html)?.text ?? r.text); }
  for (const n of r.notes) o.warn(n);
  const info = readDocument(r.text);
  o.say(`Upgraded ${input}${out !== input ? ` -> ${out}` : ''} (from ${r.from === 'legacy' ? `orz-mdhtml ${legacy?.version ?? '0.x'}` : `orz-mdhtml ${ex?.shell ?? '?'}`} to ${VERSION}, ${d})`);
  if (textOut) o.say(`Wrote ${textOut} (the text twin)`);
  const moved = Object.keys(r.moved);
  if (moved.length > 0) o.say(`Moved into the header: ${moved.join(', ')}`);
  emit(o, { command: 'upgrade', input, output: out, text: textOut, from: r.from, previous: r.from === 'legacy' ? legacy?.version ?? null : ex?.shell ?? null, shell: VERSION, delivery: d, uid: info.meta.uid ?? null, title: info.title, moved: r.moved, notes: r.notes });
}

function humanInspect(file: string, r: InspectReport): string {
  const rows: Array<[string, string]> = [['file', file]];
  const inputs: Record<InspectReport['input'], string> = { text: 'a text (twin or plain Markdown)', assembled: 'an assembled file (text format 1)', legacy: 'an orz-mdhtml 0.x file (before text format 1)', html: 'HTML that is not an orz document' };
  rows.push(['input', inputs[r.input]]);
  if (r.kind) rows.push(['kind', `${r.kind}${r.format !== null ? `, text format ${r.format}` : ''}`]);
  if (r.shell) rows.push(['shell', `orz-mdhtml ${r.shell.version} (${r.shell.relation === 'same' ? 'this version' : r.shell.relation === 'older' ? `older than this tool, ${VERSION}` : r.shell.relation === 'newer' ? `newer than this tool, ${VERSION}` : 'unknown'}), ${r.shell.delivery} delivery`]);
  if (r.legacy) rows.push(['legacy', `orz-mdhtml ${r.legacy.version ?? '0.x'}, ${r.legacy.delivery ?? 'unknown'} delivery${r.legacy.theme ? `, theme ${r.legacy.theme}` : ''}${r.legacy.metaKeys.length ? `, #orz-meta: ${r.legacy.metaKeys.join(', ')}` : ''}`]);
  if (r.kind) {
    rows.push(['uid', r.uid ?? '(none)']);
    rows.push(['title', r.title ?? '']);
    rows.push(['theme', r.theme ?? '(default)']);
    if (r.header) rows.push(['header', r.header.present ? `${r.header.keys.join(', ')}${r.header.legacy ? ` (legacy ${r.header.legacy} block)` : ''}` : '(none)']);
    if (r.input === 'assembled') rows.push(['includes', String(r.includes)]);
    if (r.checks) {
      const engine = { same: 'this release\'s engine', different: 'an engine that is not its release\'s', unverified: 'engine not verified', cdn: 'engine from jsDelivr', missing: 'no engine' }[r.checks.engine];
      const whole = r.checks.island === 'closed' && r.checks.end === 'closed';
      rows.push(['structure', `${whole ? 'complete' : r.checks.island === 'unclosed' ? 'cut off inside the text (#orz-src not closed)' : 'cut off after the text (no </html>)'}, ${engine}`]);
    }
    if (r.twin) {
      const when = { input: 'this one is newer', twin: 'the twin is newer', 'same-time': 'same modification time', unknown: '' }[r.twin.newer];
      rows.push(['twin', `${r.twin.name}: ${r.twin.holds === 'same' ? 'the same text' : r.twin.holds === 'different' ? `a different text${when ? ` (${when})` : ''}` : 'not an orz text'}`]);
    }
    rows.push(['writable', r.writable ? 'yes' : 'no']);
    rows.push(['lint', r.lint.length === 0 ? 'clean' : r.lint.map((l) => `${l.level} ${l.code}${l.line ? ` (line ${l.line})` : ''}`).join('; ')]);
  }
  const w = Math.max(...rows.map(([k]) => k.length));
  const lines = rows.map(([k, v]) => `${k.padEnd(w)}  ${v}`);
  if (r.advice.length) lines.push('', 'advice:', ...r.advice.map((a) => `  - ${a}`));
  if (r.notes.length) lines.push('', 'notes:', ...r.notes.map((n) => `  - ${n}`));
  return lines.join('\n');
}

function cmdInspect(p: Parsed, o: Io): void {
  const file = one(p, 'a file', 'inspect');
  const path = resolve(file);
  const content = readText(path);
  // the sibling twin (x.md <-> x.md.html): does it hold the same text, and which is newer?
  const sibling = twinName(path);
  let twin: { name: string; content: string; newer: 'input' | 'twin' | 'same-time'; earlier?: EarlierState | null } | undefined;
  if (sibling && sibling !== path && existsSync(sibling)) {
    const c = readMaybe(sibling);
    if (c !== null) {
      const a = mtime(path);
      const b = mtime(sibling);
      twin = { name: basename(sibling), content: c, newer: a > b ? 'input' : b > a ? 'twin' : 'same-time' };
      // does the .md.html hold a known earlier state of the text twin (assemble then needs no --force, T.11)?
      const [textPath, textContent, htmlPath, htmlContent] = path.endsWith('.md.html') ? [sibling, c, path, content] : [path, content, sibling, c];
      const held = looksHtml(htmlContent) ? documentTextOf(htmlContent) : null;
      if (held !== null && !looksHtml(textContent) && held !== storedText(textContent)) twin.earlier = earlierStateOf(textPath, htmlPath, held, storedText);
    }
  }
  const r = inspect(content, { filename: basename(path), ...(twin ? { twin } : {}) });
  if (o.json) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  else process.stdout.write(`${humanInspect(file, r)}\n`);
}

function cmdThemes(p: Parsed, o: Io): void {
  if (p.positional.length) throw new CliError('`orz-mdhtml themes` takes no arguments', EXIT_USAGE);
  if (o.json) { emit(o, { command: 'themes', themes: THEMES.map((t) => ({ ...t, default: t.id === DEFAULT_THEME })) }); return; }
  const w = Math.max(...THEMES.map((t) => t.id.length));
  for (const t of THEMES) o.say(`${t.id.padEnd(w)}  ${t.name} (${t.scheme})${t.id === DEFAULT_THEME ? '  [default]' : ''}`);
}

const COMMANDS: Record<string, (p: Parsed, o: Io) => void> = { new: cmdNew, assemble: cmdAssemble, extract: cmdExtract, upgrade: cmdUpgrade, inspect: cmdInspect, themes: cmdThemes };

// ── main ────────────────────────────────────────────────────────────────────

export function main(argv: string[]): number {
  const json = argv.includes('--json');
  let command = 'assemble';
  try {
    const first = argv[0];
    if (first === undefined) { process.stderr.write(`${USAGE}\n`); return EXIT_USAGE; }
    if (first === '-h' || first === '--help' || first === 'help') {
      const topic = first === 'help' ? argv[1] : undefined;
      process.stdout.write(`${topic && HELP[topic] ? HELP[topic] : USAGE}\n`);
      return EXIT_OK;
    }
    if (first === '-v' || first === '--version' || first === 'version') {
      if (json) process.stdout.write(`${JSON.stringify({ name: 'orz-mdhtml', version: VERSION, orzMarkdown: ORZ_MARKDOWN_VERSION, formats: [1] }, null, 2)}\n`);
      else process.stdout.write(`orz-mdhtml ${VERSION} (orz-markdown ${ORZ_MARKDOWN_VERSION}, text format 1)\n`);
      return EXIT_OK;
    }
    let rest = argv;
    if (COMMANDS[first]) { command = first; rest = argv.slice(1); }
    else if (first.startsWith('-') && first !== '-') {
      // `orz-mdhtml --cdn x.md`: options before the file, the assemble shorthand
      command = 'assemble';
    }
    if (rest.includes('--help') || rest.includes('-h')) { process.stdout.write(`${HELP[command]}\n`); return EXIT_OK; }
    const parsed = parse(command, rest);
    COMMANDS[command](parsed, io(json));
    return EXIT_OK;
  } catch (e) {
    const err = e instanceof CliError ? e : new CliError(e instanceof Error ? e.message : String(e));
    if (json) process.stdout.write(`${JSON.stringify({ ok: false, command, error: err.message, exitCode: err.code }, null, 2)}\n`);
    else process.stderr.write(`orz-mdhtml ${command}: ${err.message}\n${err.code === EXIT_USAGE ? `(see orz-mdhtml ${command} --help)\n` : ''}`);
    return err.code;
  }
}

process.exitCode = main(process.argv.slice(2));
