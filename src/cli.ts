#!/usr/bin/env node
/**
 * The orz-mdhtml CLI (FC-10; REBUILD §3a): text twins (`x.md`) and their
 * self-editing files (`x.md.html`, FC-18 text format 1).
 *
 *   orz-mdhtml new [file.md] [--title T] [--theme id] [--measure normal|wide|full] [--lang l] [--html] [--cdn | --inline]
 *   orz-mdhtml assemble <file.md> [-o out] [--cdn | --inline] [--resolve-includes | --no-includes] [--replaces sha256]   (also: orz-mdhtml <file.md>)
 *   orz-mdhtml extract <file.md.html> [-o out] [--replaces sha256]
 *   orz-mdhtml upgrade <old.md.html> [-o out] [--text out.md | --no-text] [--cdn | --inline]
 *   orz-mdhtml inspect <file> [--json]
 *
 * Inline delivery is the default (FD-02); `--cdn` loads the engine from
 * jsDelivr (web publishing). Content — title, theme, measure, language,
 * metadata — comes only from the text's header: `assemble` has no content
 * options. Every command takes `--json` (one JSON object on stdout, for
 * agents; a failure has a stable `reason` code and, where useful, `next`),
 * `--help`; exit status 0 = done, 1 = refused or failed, 2 = usage.
 * Files are never overwritten when that could lose work (see `--force`).
 */
import { chmodSync, constants as fsConstants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { decodeText, kindFromFilename, twinName, UID_PATTERN, type Lint } from 'orz-markdown/carrier';
import { compareSemver } from 'orz-markdown/carrier/shell';
import { storedText } from './assemble.js';
import { isUrl, keepReferenced, resolveFileIncludes, unresolvedIncludes } from './includes.js';
import { cacheDir, cleanInGit, earlierStateOf, lastWriter, rememberPair as recordPair, sha256, twinStateOf, type EarlierState } from './known-states.js';
import { SHA256_PATTERN } from './sha256.js';
import { assemble, extract, inspect, newDocument, readDocument, readLegacy, upgrade, DEFAULT_THEME, ORZ_MARKDOWN_VERSION, THEMES, MEASURES, VERSION, type InspectReport } from './lib.js';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

/**
 * Why a command failed: a stable code for scripts and agents (`reason` in the
 * `--json` failure object; documented in the README and the skill).
 */
export type Reason =
  | 'bad-usage'          // exit 2: an unknown option, a missing argument, options that exclude each other
  | 'no-such-file'       // the input does not exist
  | 'unreadable'         // the input is a folder or cannot be read
  | 'not-utf8'           // the input is not valid UTF-8
  | 'write-failed'       // an output (or its <file>~ copy) could not be written; nothing was replaced
  | 'exists'             // new: the file exists
  | 'not-orz'            // the output exists and is not an orz file; or the input holds no orz document
  | 'twin-differs'       // the twin (x.md.html for assemble, x.md for extract/upgrade) holds a different text that is not a known state
  | 'output-differs'     // an -o output holds another text (not the one this pair last had there), or any output holds another document (another uid)
  | 'replaces-mismatch'  // --replaces: the existing file's text is not the one whose SHA-256 was given
  | 'legacy-file'        // a 0.x file where a format-1 file is needed (extract; assemble over one)
  | 'newer-shell'        // the existing file was made by a newer orz-mdhtml (assemble, upgrade)
  | 'newer-format'       // the text's format is newer than this tool writes
  | 'unclosed-island'    // upgrade: the file was cut off inside its text
  | 'other-kind'         // an orz slides/paged document: use its own tool
  | 'assembled-input'    // assemble was given an assembled file, not a text
  | 'invalid-text'       // the text cannot be assembled (NUL, a lone surrogate, …)
  | 'engine-unavailable' // the inline engine is missing or stale (a source checkout: npm run bundle)
  | 'failed';            // anything else

/** The command that resolves a refusal: `orz-mdhtml <command> <args…>`. */
interface Next { command: string; args: string[] }

/** An expected failure: printed as a message (or `{ ok: false, reason }` with --json), never as a stack. */
class CliError extends Error {
  readonly code: number;
  readonly reason: Reason;
  constructor(message: string, codeOrReason: number | Reason = EXIT_FAILED, readonly next?: Next) {
    super(message);
    this.code = typeof codeOrReason === 'number' ? codeOrReason : EXIT_FAILED;
    this.reason = typeof codeOrReason === 'string' ? codeOrReason : this.code === EXIT_USAGE ? 'bad-usage' : 'failed';
  }
}

/** The reason of a library error (its message), for --json. */
function libReason(message: string): Reason {
  if (/engine/i.test(message) && /npm run bundle|missing|cannot be used/.test(message)) return 'engine-unavailable';
  if (/is newer than this tool \(|would downgrade/.test(message)) return 'newer-shell';
  if (/text format \d+ is newer|format.*above|newer format/i.test(message)) return 'newer-format';
  if (/not an orz-mdhtml file|not an orz/.test(message)) return 'not-orz';
  if (/an orz-(slides|paged) file/.test(message)) return 'other-kind';
  return 'invalid-text';
}

// ── help ────────────────────────────────────────────────────────────────────

const USAGE = `orz-mdhtml ${VERSION} — Markdown that edits itself.
A document is its text twin (x.md); its self-editing file (x.md.html) is assembled from it.

Usage:
  orz-mdhtml new [file.md] [--title T] [--theme id] [--measure normal|wide|full] [--lang l] [--html] [--cdn | --inline]
  orz-mdhtml assemble <file.md> [-o out.md.html] [--cdn | --inline] [--resolve-includes | --no-includes] [--replaces sha256]
  orz-mdhtml <file.md> [-o out.md.html] [--cdn | --inline]          same as assemble
  orz-mdhtml extract <file.md.html> [-o out.md] [--replaces sha256]
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
                    file is kept as <file>~ (or <file>~1, ~2, ... — a backup is never replaced)
  --replaces <sha>  (assemble, extract) replace an existing, different output only if its
                    text has this SHA-256 (the "sha256" inspect, extract, assemble and
                    upgrade print) — works with no cache, no git, in a shallow clone
  --json            print one JSON object (the result, or {"ok": false, "error", "reason",
                    "next"}) for agents
  -h, --help        help (also: orz-mdhtml <command> --help)
  -v, --version     the version

Content (title, theme, measure, lang, metadata) comes only from the text's {{nyml}} header;
assemble has no content options. Without --force nothing is overwritten that could hold
other work: an output that is not an orz file, a .md.html (or -o output) that holds a
different text than the one assembled, an x.md that differs from the text extracted
(unless the text replaced is a known state: what orz-mdhtml itself last wrote or read for
the pair, a committed, staged or recent version of the twin in git, or the text whose
SHA-256 --replaces gives; an x.md is replaced as a known state only when it and the
file's text carry the same uid), a file made by a newer orz-mdhtml, another document
(upgrade -o), or (new) any existing file. The robust way: pass the sha256 the last
command printed as --replaces.
Before editing x.md, \`orz-mdhtml inspect x.md\` says whether x.md.html holds other work
(saved in the browser); \`orz-mdhtml extract x.md.html -o x.browser.md\` brings it out
for a merge.
Exit status: 0 done, 1 refused or failed, 2 usage error.`;

const HELP: Record<string, string> = {
  new: `orz-mdhtml new [file.md] [--title T] [--theme id] [--measure normal|wide|full] [--lang l] [--html] [--cdn | --inline] [--force] [--json]

Writes a new format-1 text twin: a header (kind: document, carrier: md, a fresh uid,
the given title/theme/measure/lang), then a starter body. Without a file the text is
printed to stdout. --html also writes its assembled file (file.md.html; --cdn for a
small web file). Refuses to overwrite an existing file unless --force, which keeps
each replaced file as <file>~.
Themes: ${THEMES.map((t) => t.id).join(', ')}.`,
  assemble: `orz-mdhtml assemble <file.md> [-o out.md.html] [--cdn | --inline] [--resolve-includes | --no-includes] [--replaces <sha256>] [--force] [--json]
orz-mdhtml <file.md> [-o out.md.html] [--cdn | --inline] [--force] [--json]

Writes the self-editing file of a text twin: x.md -> x.md.html (FC-18 §3), the text
stored exactly (line endings, BOM); -o writes it elsewhere (missing folders are created).
Delivery: --inline (this release's engine inside the file) or --cdn (loads it from
jsDelivr); without either, an existing output keeps its delivery, a new one is inline.
Everything about the document — title, theme, measure, lang, metadata — comes from the
text's header; there are no content options.

Includes ({{md part.md}}, {{md https://…}}): a file shows an include only from the
record it holds (#orz-includes). The record of the existing output is kept (for the
directives the text still has); --no-includes drops it. --resolve-includes reads the
file includes from the text's folder (never outside it) and records them; a recorded file
include whose file has changed since is a warning (--json: "stale"). A directive left
unresolved shows an "Included file not available" note in the file; each one is reported
once, as a warning, with why (--json: "unresolved": [{ target, kind, reason }]).

Replacing the output (x.md.html, or the -o path; no --force needed) when it holds:
  - the same text, or
  - the text orz-mdhtml itself last wrote into it or read out of it for this pair
    (assemble, extract, new --html, upgrade; recorded by hash in
    $XDG_CACHE_HOME/orz-mdhtml or ~/.cache/orz-mdhtml), or
  - (x.md.html only) an earlier state of x.md in git: its last commit, its staged
    version or one of its 20 most recent commits (git log -- x.md), when x.md is
    tracked. A full clone works; a shallow checkout (CI's default --depth 1) knows only
    the last commit: use --replaces there. A text equal to one of the twin's last 20
    commits counts as a known earlier state, so a deliberate revert of x.md.html to
    such a text is replaced — commit the revert first, or
  - with --replaces <sha256>: exactly the text with that SHA-256 — the "sha256" that
    inspect, extract, assemble and upgrade print (works with no cache, no git, in a
    shallow clone). With --replaces, any other text is refused.
So the normal loop — edit x.md, assemble, edit, assemble — needs no --force, with or
without -o. Refuses (unless --force) to replace an output that is not an orz file
(not-orz); a 0.x file (\`orz-mdhtml upgrade x.md.html --text x.browser.md\`, merge,
then assemble with the sha256 upgrade printed as --replaces); a file made by a newer
orz-mdhtml (use \`npx orz-mdhtml@latest\`); or an output holding any other text — it
may hold work saved in the browser (twin-differs; for -o: output-differs, another text or
another document): \`orz-mdhtml extract x.md.html -o x.browser.md\`, merge that into
x.md, then the assemble command the refusal names (your arguments and --replaces). When
only the file changed (x.md is what orz-mdhtml last synced) and both texts carry the same
uid, the refusal names plain \`orz-mdhtml extract x.md.html\` — only while x.md's pair is
the last orz-mdhtml synced the file with (after \`assemble b.md -o x.md.html\` it is not).
Without a shared uid the file may hold another document's text (copied over it), so the
refusal names \`extract x.md.html -o x.browser.md\` instead (compare, merge). An output holding another
document (another uid) is refused with no next: choose another -o path. When x.md has
everything, --force replaces it and keeps the old file as x.md.html~ (or ~1, ~2, ...).`,
  extract: `orz-mdhtml extract <file.md.html> [-o out.md] [--replaces <sha256>] [--force] [--json]

Writes the exact text twin of an assembled file: x.md.html -> x.md, byte for byte the
text that was assembled (CR LF and BOM kept). A 0.x file (before text format 1) is
refused: use \`orz-mdhtml upgrade <file>\`, which writes its format-1 text twin. Warns
when the file was cut off (the text may be incomplete).

Replaces an existing x.md (or -o output) that holds a different text (no --force
needed) only when it is a known state AND x.md and the file's text carry the same uid
(the same document: without one, the file may be another document's, copied over it) —
so no edit made to it is lost, whichever file is newer:
  - exactly the text orz-mdhtml last wrote or read for this pair (unchanged since, line
    endings included), while this pair is the last orz-mdhtml synced the file with, or
  - (x.md, the file's own twin, only) its last commit, its staged version or one of its
    20 most recent commits in git (a full clone; in a shallow checkout use --replaces).
    A text equal to one of them counts as known, so a deliberate revert of x.md to such
    a text is replaced — commit the revert first, or
  - with --replaces <sha256>: exactly the x.md with that SHA-256 (\`sha256sum x.md\`,
    the "sha256" the last command printed, or of \`orz-mdhtml inspect x.md --json\`);
    with --replaces, nothing else counts.
Never (without --force) when x.md holds another document (another uid): output-differs.
Otherwise it refuses (x.md may hold edits the file lacks): extract to another name,
\`orz-mdhtml extract x.md.html -o x.browser.md\`, and merge the two into x.md.
--force replaces it anyway and keeps the old text as x.md~ (or ~1, ~2, ...). An empty
file is reported as empty (damaged), not extracted.`,
  upgrade: `orz-mdhtml upgrade <old.md.html> [-o out.md.html] [--text out.md | --no-text] [--cdn | --inline] [--force] [--json]

Turns an orz-mdhtml file into a file of this version. A 0.x file: its source is kept
exactly and its metadata, title and theme move into a format-1 header (with carrier: md
and a uid). A format-1 file: re-assembled with this shell, text and includes unchanged.
Writes the file in place (or to -o) and its text twin (twin of the output, or --text;
--no-text skips it). Keeps the old file's delivery (--cdn / --inline to choose). Also
repairs a damaged shell or engine (the text must be intact).
Refuses (unless --force) a file whose shell is newer than this tool (a downgrade), a
file cut off inside its text (#orz-src not closed: the text may be incomplete), -o onto
another document, and an existing text twin that differs (unless it is a known state,
as for extract): for a 0.x file next to its own text, \`--text x.browser.md\` and merge.
--force keeps each replaced file as <file>~.`,
  inspect: `orz-mdhtml inspect <file> [--json]

Diagnoses a text twin, an assembled file, a 0.x file or any HTML: kind, text format,
shell version and how it compares to this tool, delivery, uid, title, theme, header
keys, includes, header lint, the file's structure (island, end, engine), the SHA-256
of the text it holds (the --replaces token), whether its sibling twin (x.md <->
x.md.html) holds the same text (and that text's SHA-256) and which is newer, and advice
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
  assemble: { ...COMMON, '--out': 'value', '-o': 'value', '--cdn': 'flag', '--inline': 'flag', '--resolve-includes': 'flag', '--no-includes': 'flag', '--replaces': 'value' },
  extract: { ...COMMON, '--out': 'value', '-o': 'value', '--replaces': 'value' },
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
    throw new CliError(code === 'ENOENT' ? `${path}: no such file` : code === 'EISDIR' ? `${path} is a folder` : `${path}: ${(e as Error).message}`, code === 'ENOENT' ? 'no-such-file' : 'unreadable');
  }
  try { return decodeText(bytes, { fatal: true }); } catch { throw new CliError(`${path} is not valid UTF-8`, 'not-utf8'); }
}

/**
 * Write a file atomically (a temporary file next to it, then rename), so a
 * failure never leaves half a file. An existing file keeps its mode, and a
 * symbolic link stays a link: the file it points to is replaced. Missing
 * parent folders are created.
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
    mkdirSync(dirname(target), { recursive: true }); // -o into a folder that does not exist yet
    writeFileSync(tmp, data, { encoding: 'utf8', ...(mode !== undefined ? { mode } : {}) });
    if (mode !== undefined) chmodSync(tmp, mode); // the umask does not narrow it
    renameSync(tmp, target);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* not created */ }
    throw new CliError(`could not write ${path}: ${(e as Error).message}`, 'write-failed');
  }
}

/**
 * Keep a copy of a file about to be replaced with --force: `<file>~` — or,
 * when that name holds something else (an earlier backup with other bytes,
 * a symbolic link, a folder), the first free `<file>~1`, `<file>~2`, … An
 * existing backup is never overwritten, and a symbolic link at a backup
 * name is never followed or written through (`lstat`, then an exclusive
 * create). A backup that already holds exactly these bytes is reused.
 */
function backup(path: string, o: Io): string {
  let data: Buffer;
  try { data = readFileSync(path); } catch (e) { throw new CliError(`could not read ${path} to keep a copy: ${(e as Error).message}; nothing was written`, 'write-failed'); }
  for (let i = 0; i < 1000; i++) {
    const to = i === 0 ? `${path}~` : `${path}~${i}`;
    let st: ReturnType<typeof lstatSync> | null = null;
    try { st = lstatSync(to); } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new CliError(`could not keep a copy of ${path} as ${to}: ${(e as Error).message}; nothing was written`, 'write-failed');
    }
    if (st === null) {
      try { copyFileSync(path, to, fsConstants.COPYFILE_EXCL); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue; // created meanwhile: the next name
        throw new CliError(`could not keep a copy of ${path} as ${to}: ${(e as Error).message}; nothing was written`, 'write-failed');
      }
    } else if (!(st.isFile() && st.size === data.length && readFileSync(to).equals(data))) {
      continue; // another backup (or a link, a folder): kept; try the next name
    }
    o.warn(`replaced ${path} (--force); the old file is kept as ${to}${i > 0 ? ` (${path}~ already held something else; it is kept too)` : ''}`);
    return to;
  }
  throw new CliError(`could not keep a copy of ${path}: ${path}~ … ${path}~999 are all taken; nothing was written`, 'write-failed');
}

const mtime = (path: string): number => statSync(path).mtimeMs;
/** A path with symbolic links resolved when it exists (as the pair records key it). */
const realOrSelf = (path: string): string => { try { return realpathSync(path); } catch { return path; } };
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

/** A text's uid when its header has a well-formed one (`UID_PATTERN`), else null. */
function uidOf(text: string): string | null {
  try {
    const uid = readDocument(text).meta.uid;
    return typeof uid === 'string' && UID_PATTERN.test(uid.trim()) ? uid.trim() : null;
  } catch {
    return null;
  }
}

/** Where an earlier state of the twin was found (the human line after "Wrote …"). */
const EARLIER_SOURCE: Record<EarlierState, string> = {
  'git-head': 'its last commit',
  'git-index': 'its staged version',
  'git-log': 'one of its recent commits',
  cache: 'the text orz-mdhtml last wrote or read for this pair',
  token: 'the text whose SHA-256 --replaces gave',
};

/** A risk of losing work: why an output must not be replaced (without --force). */
interface Risk { message: string; reason: Reason; next?: Next }

/** The `--replaces` token, checked: 64 hex digits (lowercased), or null when not given. */
function replacesToken(p: Parsed): string | null {
  const t = p.values['--replaces'];
  if (t === undefined) return null;
  if (!SHA256_PATTERN.test(t)) throw new CliError(`--replaces takes a SHA-256: 64 hex digits (the "sha256" inspect, extract or assemble print), got ${JSON.stringify(t)}`, EXIT_USAGE);
  return t.toLowerCase();
}

/** A path for a message or a `next` command: as the user named it, else relative to the working folder when inside it. */
function shown(path: string, typed?: string): string {
  if (typed !== undefined) return typed;
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : path;
}

/** A word of a command line, quoted for the shell when needed. */
const sh = (word: string): string => (/^[\w./@%+=:,-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);
/** `orz-mdhtml <command> <args…>` for a message (the same words as `next`). */
const commandLine = (n: Next): string => `orz-mdhtml ${n.command} ${n.args.map(sh).join(' ')}`;

/**
 * A free name for another copy of a text (`x.browser.md` for `x.md`): the
 * text twin's name with `.browser`, never doubled (`x.browser.md` stays the
 * base of `x.browser-2.md`, not `x.browser.browser.md`), and one that does
 * not exist yet, so the command that writes it is not refused in turn.
 */
function otherName(textName: string): string {
  const stem = textName.replace(/\.md$/i, '').replace(/\.browser(?:-\d+)?$/i, '');
  for (let i = 1; ; i++) {
    const name = i === 1 ? `${stem}.browser.md` : `${stem}.browser-${i}.md`;
    if (resolve(name) !== resolve(textName) && !existsSync(resolve(name))) return name;
  }
}

/** The arguments of the user's own `assemble` (output, delivery, includes) for a suggested re-run, plus `extra`. */
function assembleArgs(p: Parsed, file: string, extra: string[] = []): string[] {
  const args = [file];
  if (p.values['--out'] !== undefined) args.push('-o', p.values['--out']);
  if (p.flags.has('--cdn')) args.push('--cdn');
  else if (p.flags.has('--inline')) args.push('--inline');
  if (p.flags.has('--resolve-includes') && !extra.includes('--resolve-includes')) args.push('--resolve-includes');
  if (p.flags.has('--no-includes') && !extra.includes('--resolve-includes')) args.push('--no-includes'); // they exclude each other
  return [...args, ...extra];
}

/**
 * Record the pair (src/known-states.ts); when the record cannot be written,
 * say so: the next assemble or extract over a changed twin then needs the
 * token (`--replaces <sha256>`, the hash this command printed).
 */
function rememberPair(twin: string, file: string, held: string, twinText: string, o: Io, token: { command: string; sha: string }): void {
  const r = recordPair(twin, file, held, twinText);
  if (r === 'recorded') return;
  const where = r === 'no-cache' ? 'no cache folder: set $XDG_CACHE_HOME or HOME' : `cache not writable: ${cacheDir() ?? ''}`;
  o.warn(`pair not recorded (${where}); the next ${token.command} needs --replaces ${token.sha}`);
}

/** ", changed after <other>" — unless both files are clean in git (then the times are a checkout's and say nothing). */
function changedAfter(path: string, other: string, words: (o: string) => string, otherName: string): string {
  if (!existsSync(path) || !existsSync(other) || !(mtime(path) > mtime(other))) return '';
  if (cleanInGit(path) && cleanInGit(other)) return '';
  return words(otherName);
}

/** What `assemble` checks an existing output against. */
interface AssembleTarget {
  p: Parsed;
  input: string;
  out: string;
  text: string;
  names: { input: string; out: string; twin: boolean };
  token: string | null;
}

/**
 * Whether `out` (an existing output) may be replaced by the assembly of
 * `text` read from `input` (claims T.7, T.11, T.12, T.14):
 *
 * - it holds the same text (as a new file would store it): yes;
 * - with `--replaces <sha256>`: only when the text it holds has that hash
 *   (`token`); any other text is refused (`replaces-mismatch`);
 * - it holds an earlier state: the text this CLI itself last wrote into it
 *   or read out of it for this pair (`input` ↔ `out`, any output path) or,
 *   for the twin `x.md.html` of `x.md`, a committed, staged or recent version
 *   of `x.md` in git (src/known-states.ts): yes, without `--force`
 *   (`earlier`);
 * - it is not an orz file, a 0.x file, or holds any other text — whichever
 *   file is newer (it may hold work saved in the browser that the text
 *   lacks): no (`risk`), unless `--force`, which keeps it as `<file>~`.
 *
 * Every command a refusal suggests is built from the user's own arguments.
 */
function assembledOutputCheck(t: AssembleTarget, existing: string | null): { risk: Risk | null; earlier: EarlierState | null } {
  const { p, input, out, text, names, token } = t;
  const isHtml = existing !== null && looksHtml(existing);
  const held = isHtml ? documentTextOf(existing!) : null;
  if (held === null) {
    if (existing !== null && existing.trim() === '') return { risk: { message: `${names.out} exists and is empty (${statSync(out).size} bytes): a damaged or unfinished file, not an orz file; not replaced (pass --force to replace it — the empty file is kept as ${names.out}~ — or -o another path)`, reason: 'not-orz' }, earlier: null };
    return { risk: { message: `${names.out} exists and is not an orz file; not replaced (pass --force to replace it, or -o another path)`, reason: 'not-orz' }, earlier: null };
  }
  if (held === storedText(text)) return { risk: null, earlier: null };
  const legacy = readLegacy(existing!) !== null;
  const other = otherName(names.input);
  const heldHash = sha256(held);
  const again = (extra: string[]): string => commandLine({ command: 'assemble', args: assembleArgs(p, names.input, extra) });
  const pull: Next = { command: 'extract', args: [names.out, '-o', other] };
  const legacyPull: Next = { command: 'upgrade', args: [names.out, '--text', other] };
  if (token !== null) {
    if (heldHash === token) return { risk: null, earlier: 'token' };
    return {
      risk: {
        message: `${names.out} no longer holds the text you named (--replaces ${token}): it holds another one (sha256 ${heldHash}) — saved in the browser or written by someone else since; not replaced. Bring its changes in: \`${commandLine(legacy ? legacyPull : pull)}\`, merge them into ${names.input}, then \`${legacy ? `${again(['--replaces'])}\` followed by the sha256 that upgrade printed` : `${again(['--replaces', heldHash])}\``}`,
        reason: 'replaces-mismatch',
        next: legacy ? legacyPull : pull,
      },
      earlier: null,
    };
  }
  const earlier = earlierStateOf(input, out, held, storedText, { git: names.twin });
  if (earlier !== null) return { risk: null, earlier };
  // another document (another well-formed uid) — never "bring its text into this input": nothing to merge, no next
  const heldUid = uidOf(held);
  const ownUid = uidOf(text);
  if (heldUid && ownUid && heldUid !== ownUid) {
    return {
      risk: { message: `${names.out} holds another document (uid ${heldUid}; ${names.input} is ${ownUid}); not replaced. Choose another -o path, or pass --force to replace it (the old file is kept as ${names.out}~)`, reason: 'output-differs' },
      earlier: null,
    };
  }
  if (legacy) {
    return {
      risk: {
        message: `${names.out} is a legacy orz-mdhtml 0.x file holding a different text than ${names.input}; not replaced. Its text is not readable by extract: \`${commandLine(legacyPull)}\` writes its format-1 text to ${other} (and makes ${names.out} a file of this version, printing the sha256 of the text it then holds); compare and merge it into ${names.input}, then \`${again(['--replaces'])}\` followed by that sha256 (it replaces ${names.out} only while it still holds that text)`,
        reason: 'legacy-file',
        next: legacyPull,
      },
      earlier: null,
    };
  }
  // only the file changed: the text is the very one the CLI last synced with this file (this pair is the file's last
  // writer), or, for the twin, committed — bring the file's work in, nothing to merge. Only for the SAME document
  // (both texts carry the same uid): neither the record nor git proves that the file was not replaced by another
  // document's file (copied over it, or written by another input while the record could not be updated), and
  // following `extract` would then replace the input with that other text (G1, G2)
  const sameDocument = heldUid !== null && heldUid === ownUid;
  const unchanged = twinStateOf(input, out, text, { git: names.twin }) !== null;
  if (sameDocument && unchanged) {
    const bring: Next = { command: 'extract', args: [names.out, ...(twinName(out) === input ? [] : ['-o', names.input])] };
    return {
      risk: {
        message: `${names.out} holds a different text than ${names.input}, and ${names.input} is unchanged since orz-mdhtml last synced the pair (or is committed): the file holds newer work (saved in the browser?); not replaced. \`${commandLine(bring)}\` brings it into ${names.input} (no --force needed). To put ${names.input}'s text in the file anyway: \`${again(['--replaces', heldHash])}\``,
        reason: names.twin ? 'twin-differs' : 'output-differs',
        next: bring,
      },
      earlier: null,
    };
  }
  if (unchanged) {
    // the input is unchanged, but nothing proves the file holds the same document (no shared uid): bring the file's
    // text out to another name and compare — never into the input automatically
    return {
      risk: {
        message: `${names.out} holds a different text than ${names.input}. ${names.input} is unchanged since orz-mdhtml last synced the pair (or is committed), so the file may hold newer work (saved in the browser?) — or another document's text (copied over it): the two texts do not carry the same uid, so it cannot be told; not replaced. Bring its text out and compare: \`${commandLine(pull)}\`; merge what belongs into ${names.input}, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text)`,
        reason: names.twin ? 'twin-differs' : 'output-differs',
        next: pull,
      },
      earlier: null,
    };
  }
  const writer = lastWriter(out);
  const later = writer !== null && writer !== realOrSelf(input)
    ? ` (orz-mdhtml last wrote it from ${shown(writer)})`
    : changedAfter(out, input, () => ' and was changed after it (saved in the browser?)', names.input);
  if (!names.twin) {
    return {
      risk: {
        message: `${names.out} holds another text than ${names.input}${later} — not the text orz-mdhtml last wrote there from ${names.input}; not replaced. If it has changes ${names.input} lacks, bring them in first: \`${commandLine(pull)}\`, then merge, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text). When ${names.input} has everything, run again with --force (the old file is kept as ${names.out}~)`,
        reason: 'output-differs',
        next: pull,
      },
      earlier: null,
    };
  }
  return {
    risk: {
      message: `${names.out} holds a different text than ${names.input}${later} — not its last commit, nor the text orz-mdhtml last wrote there; not replaced. If it has changes ${names.input} lacks, bring them in first: \`${commandLine(pull)}\`, then merge, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text). When ${names.input} has everything, run again with --force (the old file is kept as ${names.out}~)`,
      reason: 'twin-differs',
      next: pull,
    },
    earlier: null,
  };
}

/**
 * Whether the text file `out` may be replaced by `text` (the text of the
 * file `file`; extract and upgrade, claims T.7, T.12, T.14): it does not
 * exist or holds exactly that text; never (without `--force`) when it holds
 * another document (another well-formed uid than `uid`, the uid of `text`;
 * null: not checked); with `--replaces`, its own text has the given hash
 * (and nothing else counts); or it is a known state (src/known-states.ts
 * `twinStateOf`: exactly the text the CLI last wrote or read for the pair
 * while that pair is the file's last writer, or — when `out` is the file's
 * own twin — a committed/staged/recent version in git) AND `out` and `text`
 * carry the same uid (`uid` non-null and equal to `out`'s): a known state of
 * `out` says nothing about what `file` holds — another document's file may
 * have been copied over it — so without a shared uid it is never replaced
 * automatically. Anything else may hold edits the file lacks — whichever is
 * newer.
 */
function textOutputCheck(out: string, text: string, file: string, names: { out: string; file: string }, token: string | null, uid: string | null, advice: (h: string) => { message: string; next?: Next }): { risk: Risk | null; earlier: EarlierState | null } {
  if (!existsSync(out)) return { risk: null, earlier: null };
  const existing = readMaybe(out);
  if (existing === text) return { risk: null, earlier: null };
  const h = existing === null ? null : sha256(existing);
  const existingUid = existing === null ? null : uidOf(existing);
  if (uid !== null && existingUid !== null && uid !== existingUid) {
    return { risk: { message: `${names.out} holds another document (uid ${existingUid}; ${names.file} is ${uid}); not overwritten. Write it to another path (-o), or pass --force to replace it (the old text is kept as ${names.out}~)`, reason: 'output-differs' }, earlier: null };
  }
  if (token !== null) {
    if (h === token) return { risk: null, earlier: 'token' };
    const a = advice(h ?? '');
    return { risk: { message: `${names.out} no longer holds the text you named (--replaces ${token})${h ? `: it holds another one (sha256 ${h})` : ''}; not overwritten. ${a.message}`, reason: 'replaces-mismatch', ...(a.next ? { next: a.next } : {}) }, earlier: null };
  }
  // a known state of the pair is replaced only for the SAME document (both texts carry the same uid): the record and
  // git vouch for `out`'s text, not for what `file` holds — another document's file may have been copied over it (G1)
  const known = existing === null ? null : twinStateOf(out, file, existing, { git: twinName(file) === out });
  if (known !== null && uid !== null && existingUid === uid) return { risk: null, earlier: known };
  const later = changedAfter(out, file, (n) => `, changed after ${n}`, names.file);
  const a = advice(h ?? '');
  if (known !== null) {
    return { risk: { message: `${names.out} exists and holds a different text; it is unchanged since orz-mdhtml last synced it (or is committed), but ${names.file} and ${names.out} do not carry the same uid, so ${names.file} may hold another document's text (copied over it); not overwritten. ${a.message}`, reason: 'twin-differs', ...(a.next ? { next: a.next } : {}) }, earlier: null };
  }
  return { risk: { message: `${names.out} exists and holds a different text${later} — not the text orz-mdhtml last wrote or read for this pair, nor a committed version; not overwritten (it may hold edits ${names.file} lacks). ${a.message}`, reason: 'twin-differs', ...(a.next ? { next: a.next } : {}) }, earlier: null };
}

/** Refuse a risk, or with --force keep a copy of what is replaced. */
function guard(path: string, risk: Risk | null, force: boolean, o: Io): string | null {
  if (risk === null) return null;
  if (!force) throw new CliError(risk.message, risk.reason, risk.next);
  return backup(path, o);
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
  const facts = { kind: 'md', format: info.format, uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null, sha256: sha256(text) };
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
  const present = [path, htmlPath].filter((f): f is string => f !== null && existsSync(f));
  if (!force && present.length > 0) throw new CliError(`${present[0]} already exists; not overwritten (pass --force to replace it; the old file is kept as ${present[0]}~)`, 'exists');
  const html = htmlPath ? assemble(text, { delivery: delivery(p) }) : null;
  // --force: every file replaced is kept as <file>~ first (nothing is written if a copy fails)
  const backups = present.map((f) => backup(f, o));
  writeOut(path, text);
  o.say(`Wrote ${path}`);
  if (htmlPath && html !== null) {
    writeOut(htmlPath, html);
    rememberPair(path, htmlPath, storedText(text), text, o, { command: 'assemble', sha: sha256(storedText(text)) });
    o.say(`Wrote ${htmlPath} (${delivery(p)})`);
  }
  emit(o, { command: 'new', file: path, html: htmlPath, ...facts, ...(htmlPath ? { delivery: delivery(p), shell: VERSION } : {}), backups });
}

/** One include directive the written file does not resolve (assemble's `--json` `unresolved`). */
interface Unresolved {
  target: string;
  kind: 'file' | 'url';
  /**
   * `not-recorded` (a file include not in the record that --resolve-includes
   * would read: not passed), `url` (a URL include not in the record: the CLI
   * fetches no URLs), or why it cannot be read from the text's folder (with
   * or without --resolve-includes): `no-such-file`, `outside-folder`,
   * `unreadable`, `not-utf8`, `folder-unreadable`.
   */
  reason: 'not-recorded' | 'url' | 'no-such-file' | 'outside-folder' | 'unreadable' | 'not-utf8' | 'folder-unreadable';
}

const NOTE = 'the file shows an "Included file not available" note there';

/** A recorded file include older than the file in the text's folder (assemble's `--json` `stale`). */
interface Stale { target: string; kind: 'file'; reason: 'stale-record' }

function cmdAssemble(p: Parsed, o: Io): void {
  const file = one(p, 'a text file (file.md)', 'assemble');
  const input = resolve(file);
  const kind = kindFromFilename(input);
  if (kind === 'slides' || kind === 'paged') throw new CliError(`${file} is an orz ${kind} text: use orz-${kind}`, 'other-kind');
  const resolveFlag = p.flags.has('--resolve-includes');
  if (resolveFlag && p.flags.has('--no-includes')) throw new CliError('--resolve-includes and --no-includes exclude each other', EXIT_USAGE);
  const token = replacesToken(p);
  const text = readText(input);
  if (looksHtml(text) && documentTextOf(text) !== null) {
    throw new CliError(`${file} is an assembled file, not a text: \`orz-mdhtml extract ${sh(file)}\` gives its text; \`orz-mdhtml upgrade ${sh(file)}\` re-assembles it with this version`, 'assembled-input', { command: 'extract', args: [file] });
  }
  const outArg = p.values['--out'];
  const toStdout = outArg === '-';
  if (toStdout && o.json) throw new CliError('-o - (stdout) and --json exclude each other', EXIT_USAGE);
  const out = toStdout ? null : outArg !== undefined ? resolve(outArg) : (kind === 'md' && !input.endsWith('.md.html') ? twinName(input) : null);
  if (!toStdout && out === null) throw new CliError(`cannot name the output of ${file} (a text twin's name ends in .md): pass -o out.md.html`, EXIT_USAGE);
  if (out === input) throw new CliError('the output would overwrite the input', EXIT_USAGE);
  const info = readDocument(text);
  if (info.kind !== 'md' && kind === null) throw new CliError(`${file}: the header says carrier: ${info.kind}; use orz-${info.kind}`, 'other-kind');
  if (info.format > 1) throw new CliError(`${file}: text format ${info.format} is newer than this tool writes (format 1); use a newer orz-mdhtml (\`npx ${commandLine({ command: 'assemble', args: assembleArgs(p, file) }).replace(/^orz-mdhtml /, 'orz-mdhtml@latest ')}\`)`, 'newer-format');
  const force = p.flags.has('--force');

  // the existing output: may it be replaced, and which includes and delivery does it hold?
  const exists = out !== null && existsSync(out);
  const existing = exists ? readMaybe(out!) : null;
  const names = { input: shown(input, file), out: out === null ? '-' : shown(out, outArg ?? twinName(file) ?? undefined), twin: out !== null && out === twinName(input) };
  const check = exists ? assembledOutputCheck({ p, input, out: out!, text, names, token }, existing) : { risk: null, earlier: null };
  const prior = existing !== null && looksHtml(existing) ? extract(existing) : null;
  const priorLegacy = existing !== null && looksHtml(existing) && prior === null ? readLegacy(existing) : null;
  // the delivery: as asked (--cdn / --inline), else the existing file's (as upgrade and browser saves keep it), else inline
  const d = delivery(p, prior?.delivery === 'cdn' || priorLegacy?.delivery === 'cdn' ? 'cdn' : 'inline');
  // a file made by a newer orz-mdhtml: re-assembling here would downgrade its shell (as upgrade refuses)
  const newerShell = prior && prior.kind === 'md' && prior.shell && compareSemver(prior.shell, VERSION) === 1 ? prior.shell : null;
  const shellRisk: Risk | null = newerShell === null ? null : {
    message: `${names.out} was made by a newer orz-mdhtml (${newerShell}) than this tool (${VERSION}): assembling here would replace its shell with an older one; not replaced. Use \`npx ${commandLine({ command: 'assemble', args: assembleArgs(p, names.input) }).replace(/^orz-mdhtml /, 'orz-mdhtml@latest ')}\` (or pass --force: the old file is kept as ${names.out}~)`,
    reason: 'newer-shell',
  };
  if (!force) for (const r of [check.risk, shellRisk]) if (r !== null) throw new CliError(r.message, r.reason, r.next);

  // includes (FC-18 §8.3): the existing file's record, kept for the directives the text still has
  let includes: Record<string, string> = {};
  if (!p.flags.has('--no-includes') && prior !== null) {
    const held = prior.includes;
    if (held) includes = keepReferenced(text, held);
  }
  // what --resolve-includes reads from the text's folder (read either way: it names why a directive stays
  // unresolved, and which recorded file include is older than its file)
  const probe = resolveFileIncludes(text, dirname(input));
  const problems = new Map<string, { reason: Unresolved['reason']; message: string }>();
  for (const problem of probe.problems) problems.set(problem.target, problem);
  let resolved = 0;
  const stale: Stale[] = [];
  if (resolveFlag) {
    for (const key of Object.keys(includes)) if (!isUrl(key)) delete includes[key]; // files are read afresh
    includes = { ...includes, ...probe.includes };
    resolved = Object.keys(probe.includes).length;
  } else {
    for (const [target, recorded] of Object.entries(includes)) {
      const current = probe.includes[target];
      if (isUrl(target) || current === undefined || current === recorded) continue;
      stale.push({ target, kind: 'file', reason: 'stale-record' });
      o.warn(`{{md ${target}}} is stale (stale-record): the file shows the text recorded in ${names.out}, and ${target} in the text's folder has changed since; \`${commandLine({ command: 'assemble', args: assembleArgs(p, names.input, ['--resolve-includes']) })}\` records the current one`);
    }
  }
  // every directive left unresolved: one warning each, and the structured list
  const folderProblem = resolveFlag ? probe.folderProblem : null;
  const unresolved: Unresolved[] = unresolvedIncludes(text, includes).map((target) => {
    if (isUrl(target)) return { target, kind: 'url', reason: 'url' };
    const problem = problems.get(target);
    return { target, kind: 'file', reason: problem ? problem.reason : !resolveFlag ? 'not-recorded' : folderProblem ? 'folder-unreadable' : 'no-such-file' };
  });
  for (const u of unresolved) {
    const problem = problems.get(u.target);
    const why = u.kind === 'url'
      ? `${NOTE} (a URL include is shown only from the record of a file that holds it, or by a host that resolves it; the CLI fetches no URLs)`
      : problem ? `${problem.message}${!resolveFlag && problem.reason === 'outside-folder' ? ' — --resolve-includes does not read it either: copy it into the folder' : ''}; ${NOTE}`
      : resolveFlag ? `${folderProblem ?? 'not read'}; ${NOTE}`
      : `${NOTE} (pass --resolve-includes to read it from the text's folder: \`${commandLine({ command: 'assemble', args: assembleArgs(p, names.input, ['--resolve-includes']) })}\`)`;
    o.warn(`{{md ${u.target}}} is not resolved: ${why}`);
  }

  let html: string;
  try { html = assemble(text, { delivery: d, ...(Object.keys(includes).length ? { includes } : {}) }); } catch (e) {
    const message = (e as Error).message.replace(/^orz-mdhtml: /, '');
    throw new CliError(`${file}: ${message}`, libReason(message));
  }
  for (const w of errors(info.lint)) o.warn(w);
  for (const w of warnings(info.lint)) o.warn(w);
  if (toStdout) { process.stdout.write(html); return; }
  const backedUp = check.risk !== null || shellRisk !== null ? backup(out!, o) : null;
  if (shellRisk !== null) o.warn(`${names.out} had a newer shell (orz-mdhtml ${newerShell}); --force re-assembled it with this older one (${VERSION})`);
  writeOut(out!, html);
  const stored = storedText(text);
  const hash = sha256(stored);
  rememberPair(input, out!, stored, text, o, { command: 'assemble', sha: hash });
  const n = Object.keys(includes).length;
  o.say(`Wrote ${out} (${d}${!p.flags.has('--cdn') && !p.flags.has('--inline') && prior !== null ? ' as before' : ''}, orz-mdhtml ${VERSION}${n ? `, ${n} include${n === 1 ? '' : 's'}` : ''})`);
  if (check.earlier !== null) o.say(`  (it held ${check.earlier === 'token' ? 'the text whose SHA-256 --replaces gave' : `an earlier text of ${basename(input)}: ${EARLIER_SOURCE[check.earlier]}`})`);
  o.say(`  sha256 ${hash} (the text it holds; --replaces takes it)`);
  emit(o, { command: 'assemble', input, output: out, kind: 'md', format: info.format, shell: VERSION, delivery: d, uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null, includes: n, resolved, unresolved, stale, backup: backedUp, replaced: check.earlier, sha256: hash, bytes: Buffer.byteLength(html, 'utf8') });
}

function cmdExtract(p: Parsed, o: Io): void {
  const file = one(p, 'an assembled file (file.md.html)', 'extract');
  const input = resolve(file);
  const token = replacesToken(p);
  const html = readText(input);
  const outArg = p.values['--out'];
  const legacy = readLegacy(html);
  const ex = legacy ? null : extract(html);
  if (legacy) {
    // upgrade writes the text twin of the file unless --text: next to an existing text, to another name (then merge)
    const textTarget = outArg !== undefined && outArg !== '-' ? outArg : twinName(file) ?? undefined;
    const taken = textTarget !== undefined && existsSync(resolve(textTarget));
    const textArgs = textTarget === undefined ? [] : taken ? ['--text', otherName(textTarget)] : outArg !== undefined && outArg !== '-' ? ['--text', outArg] : [];
    const next: Next = { command: 'upgrade', args: [file, ...textArgs] };
    throw new CliError(`${file} is an orz-mdhtml ${legacy.version ?? '0.x'} file (before text format 1): run \`${commandLine(next)}\` — it writes the format-1 text${taken ? ` to ${textArgs[1]} (${textTarget} exists: compare and merge the two)` : ' twin'} (the source exactly, metadata moved into the header) and a file of this version`, 'legacy-file', next);
  }
  if (!ex) {
    if (html.trim() === '') throw new CliError(`${file} is empty (${statSync(input).size} bytes): a damaged or unfinished file, it holds no text to extract — look for its text twin or a backup (${file}~)`, 'not-orz');
    throw new CliError(`${file} holds no orz document (no #orz-src island); \`orz-mdhtml inspect ${sh(file)}\` says what it is`, 'not-orz', { command: 'inspect', args: [file] });
  }
  if (ex.shell === '') o.warn(`${file} has an #orz-src island but no #orz-shell: an unknown writer; the island was read as format 1 would be — check the text`);
  else if (inspect(html).checks?.island === 'unclosed') o.warn(`${file} was cut off: its #orz-src island is not closed, so the text may be incomplete — compare it with a backup before relying on it`);
  const toStdout = outArg === '-';
  if (toStdout && o.json) throw new CliError('-o - (stdout) and --json exclude each other', EXIT_USAGE);
  if (toStdout) { process.stdout.write(ex.text); return; }
  const out = outArg !== undefined ? resolve(outArg) : twinName(input);
  if (out === null) throw new CliError(`cannot name the text twin of ${file} (an assembled file's name ends in .md.html): pass -o out.md`, EXIT_USAGE);
  if (out === input) throw new CliError('the output would overwrite the input', EXIT_USAGE);
  const names = { out: shown(out, outArg ?? twinName(file) ?? undefined), file };
  const other = otherName(names.out);
  const outArgs = outArg !== undefined ? ['-o', outArg] : [];
  const check = textOutputCheck(out, ex.text, input, names, token, uidOf(ex.text), (h) => {
    const pull: Next = { command: 'extract', args: [file, '-o', other] };
    return {
      message: `If ${names.out} has edits of its own, extract to another name and merge the two: \`${commandLine(pull)}\`.${h ? ` When ${names.out} holds no edit you want to keep, \`${commandLine({ command: 'extract', args: [file, ...outArgs, '--replaces', h] })}\` replaces it while it still holds that text;` : ''} --force replaces it anyway (the old text is kept as ${names.out}~)`,
      next: pull,
    };
  });
  const backedUp = guard(out, check.risk, p.flags.has('--force'), o);
  writeOut(out, ex.text);
  const hash = sha256(ex.text);
  rememberPair(out, input, ex.text, ex.text, o, { command: 'extract', sha: hash });
  const info = readDocument(ex.text, { kind: ex.kind });
  o.say(`Wrote ${out} (${ex.kind}, text format ${ex.format}, from orz-${ex.kind === 'md' ? 'mdhtml' : ex.kind} ${ex.shell || 'unknown'})`);
  if (check.earlier !== null) o.say(`  (${names.out} held ${check.earlier === 'token' ? 'the text whose SHA-256 --replaces gave' : `a known state: ${EARLIER_SOURCE[check.earlier]}`})`);
  o.say(`  sha256 ${hash} (of the text; --replaces takes it)`);
  emit(o, { command: 'extract', input, output: out, kind: ex.kind, format: ex.format, shell: ex.shell || null, delivery: ex.delivery || null, uid: info.meta.uid ?? null, title: info.title, includes: ex.includes ? Object.keys(ex.includes).length : 0, backup: backedUp, replaced: check.earlier, sha256: hash, bytes: Buffer.byteLength(ex.text, 'utf8') });
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
  const out = p.values['--out'] !== undefined ? resolve(p.values['--out']) : input;
  const outName = shown(out, p.values['--out'] ?? file);
  // a newer shell (a downgrade) and a file cut off inside its text: refused unless --force
  const newerShell = ex && ex.kind === 'md' && ex.shell && compareSemver(ex.shell, VERSION) === 1 ? ex.shell : null;
  if (newerShell !== null && !force) {
    throw new CliError(`${file}: the file's shell (orz-mdhtml ${newerShell}) is newer than this tool (${VERSION}); upgrading would downgrade it. Use \`npx orz-mdhtml@latest upgrade ${file}\`, or pass --force to re-assemble it with this older shell anyway (the old file is kept as ${outName}~)`, 'newer-shell');
  }
  const cut = ex !== null && ex.kind === 'md' && ex.shell !== '' && inspect(html).checks?.island === 'unclosed';
  const recovered = `${file.replace(/\.md\.html$/i, '').replace(/\.html?$/i, '')}.recovered.md`;
  if (cut && !force) {
    throw new CliError(`${file} was cut off inside its text (#orz-src is not closed): the text may be incomplete, and upgrading would make that the file's whole text; not upgraded. Recover what you can: \`orz-mdhtml extract ${file} -o ${recovered}\`, compare it with the text twin or a backup; --force upgrades it anyway (the old file is kept as ${outName}~)`, 'unclosed-island', { command: 'extract', args: [file, '-o', recovered] });
  }
  let r: ReturnType<typeof upgrade>;
  try { r = upgrade(html, { delivery: d, ...(force ? { downgrade: true } : {}) }); } catch (e) {
    const message = (e as Error).message.replace(/^orz-mdhtml( upgrade)?: /, '');
    throw new CliError(`${file}: ${message}`, libReason(message));
  }
  if (p.flags.has('--no-text') && p.values['--text'] !== undefined) throw new CliError('--text and --no-text exclude each other', EXIT_USAGE);
  const textOut = p.flags.has('--no-text') ? null : p.values['--text'] !== undefined ? resolve(p.values['--text']) : twinName(out);
  if (!p.flags.has('--no-text') && textOut === null) throw new CliError(`cannot name the text twin of ${out}: pass --text out.md (or --no-text)`, EXIT_USAGE);
  if (textOut === out || textOut === input) throw new CliError('the text twin would overwrite the file', EXIT_USAGE);
  // check every output before writing any
  let outRisk: Risk | null = null;
  if (out !== input && existsSync(out)) {
    const existing = readMaybe(out);
    const held = existing !== null && looksHtml(existing) ? documentTextOf(existing) : null;
    if (held === null) outRisk = { message: `${outName} exists and is not an orz file; not overwritten (pass --force, or -o another path)`, reason: 'not-orz' };
    else if (held !== r.text) outRisk = { message: `${outName} exists and holds another text; not overwritten (pass --force, or -o another path)`, reason: 'output-differs' };
  }
  const textName = textOut === null ? '' : shown(textOut, p.values['--text'] ?? twinName(outName) ?? undefined);
  const otherText = otherName(textName);
  // the upgraded text's uid — unless upgrade minted it for a 0.x file without one (then it says nothing about identity)
  const newUid = uidOf(r.text);
  const ownUids = legacy ? [uidOf(legacy.text), legacy.meta?.uid, legacy.docId].map((u) => (typeof u === 'string' ? u.trim() : null)) : [newUid];
  const textCheck = textOut ? textOutputCheck(textOut, r.text, out, { out: textName, file: outName }, null, newUid !== null && ownUids.includes(newUid) ? newUid : null, () => ({
    message: legacy
      ? `Upgrade to another name instead: \`${commandLine({ command: 'upgrade', args: [file, ...(p.values['--out'] !== undefined ? ['-o', outName] : []), ...(p.flags.has('--cdn') ? ['--cdn'] : p.flags.has('--inline') ? ['--inline'] : []), '--text', otherText] })}\`, then compare ${otherText} with ${textName} and merge (keep the new header); or --no-text, or --force (the old text is kept as ${textName}~)`
      : `Pass --text ${otherText} (then merge), --no-text, or --force to replace it (the old text is kept as ${textName}~)`,
    next: { command: 'upgrade', args: [file, ...(p.values['--out'] !== undefined ? ['-o', outName] : []), ...(p.flags.has('--cdn') ? ['--cdn'] : p.flags.has('--inline') ? ['--inline'] : []), '--text', otherText] },
  })) : { risk: null, earlier: null };
  if (!force) for (const risk of [outRisk, textCheck.risk]) if (risk !== null) throw new CliError(risk.message, risk.reason, risk.next);
  const backups: string[] = [];
  if (out === input && (newerShell !== null || cut)) backups.push(backup(input, o));
  const ob = guard(out, outRisk, force, o);
  if (ob) backups.push(ob);
  if (textOut) { const tb = guard(textOut, textCheck.risk, force, o); if (tb) backups.push(tb); }
  if (newerShell !== null) o.warn(`${file} had a newer shell (orz-mdhtml ${newerShell}); --force re-assembled it with this older one (${VERSION})`);
  if (cut) o.warn(`${file} was cut off inside its text; --force upgraded it with the text it holds, which may be incomplete`);
  writeOut(out, r.html);
  const held = extract(r.html)?.text ?? r.text;
  if (textOut) { writeOut(textOut, r.text); rememberPair(textOut, out, held, r.text, o, { command: 'assemble', sha: sha256(held) }); }
  for (const n of r.notes) o.warn(n);
  const info = readDocument(r.text);
  o.say(`Upgraded ${input}${out !== input ? ` -> ${out}` : ''} (from ${r.from === 'legacy' ? `orz-mdhtml ${legacy?.version ?? '0.x'}` : `orz-mdhtml ${ex?.shell ?? '?'}`} to ${VERSION}, ${d})`);
  if (textOut) o.say(`Wrote ${textOut} (the text twin)`);
  const moved = Object.keys(r.moved);
  if (moved.length > 0) o.say(`Moved into the header: ${moved.join(', ')}`);
  o.say(`  sha256 ${sha256(held)} (the text the file holds; --replaces takes it)`);
  emit(o, { command: 'upgrade', input, output: out, text: textOut, from: r.from, previous: r.from === 'legacy' ? legacy?.version ?? null : ex?.shell ?? null, shell: VERSION, delivery: d, uid: info.meta.uid ?? null, title: info.title, moved: r.moved, notes: r.notes, backups, sha256: sha256(held) });
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
    if (r.sha256) rows.push(['sha256', `${r.sha256} (of the text it holds; --replaces takes it)`]);
    if (r.twin) {
      const when = { input: 'this one is newer', twin: 'the twin is newer', 'same-time': 'same modification time', unknown: '' }[r.twin.newer];
      const earlier = r.twin.earlier ? `, an earlier text of the text twin (${EARLIER_SOURCE[r.twin.earlier]})` : '';
      rows.push(['twin', `${r.twin.name}: ${r.twin.holds === 'same' ? 'the same text' : r.twin.holds === 'different' ? `a different text${when ? ` (${when})` : ''}${earlier}` : 'not an orz text'}`]);
      if (r.twin.sha256 && r.twin.holds === 'different') rows.push(['twin sha256', r.twin.sha256]);
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
  let twin: { name: string; content: string; newer: 'input' | 'twin' | 'same-time'; earlier?: Exclude<EarlierState, 'token'> | null } | undefined;
  if (sibling && sibling !== path && existsSync(sibling)) {
    const c = readMaybe(sibling);
    if (c !== null) {
      const a = mtime(path);
      const b = mtime(sibling);
      twin = { name: twinName(file) ?? basename(sibling), content: c, newer: a > b ? 'input' : b > a ? 'twin' : 'same-time' };
      // does the .md.html hold a known earlier state of the text twin (assemble then needs no --force, T.11)?
      const [textPath, textContent, htmlPath, htmlContent] = path.endsWith('.md.html') ? [sibling, c, path, content] : [path, content, sibling, c];
      const held = looksHtml(htmlContent) ? documentTextOf(htmlContent) : null;
      if (held !== null && !looksHtml(textContent) && readLegacy(htmlContent) === null && held !== storedText(textContent)) twin.earlier = earlierStateOf(textPath, htmlPath, held, storedText) as Exclude<EarlierState, 'token'> | null;
    }
  }
  // the name as given: advice names runnable paths (inspect sub/x.md → assemble sub/x.md)
  const r = inspect(content, { filename: file, ...(twin ? { twin } : {}) });
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

/** A bare word (no dot, no slash), as a command name is — a text's file name has an extension or a folder. */
const looksLikeCommand = (word: string): boolean => /^[a-z][a-z0-9-]*$/i.test(word);

/** Commands of the sibling carriers, and what orz-mdhtml offers instead. */
const OTHER_COMMANDS: Record<string, string> = {
  templates: 'orz-mdhtml has no templates (that is orz-paged); a document\'s look is its theme: `orz-mdhtml themes` lists them',
  template: 'orz-mdhtml has no templates (that is orz-paged); a document\'s look is its theme: `orz-mdhtml themes` lists them',
  theme: 'did you mean `orz-mdhtml themes`? (it lists the themes a header may name)',
  layouts: 'orz-mdhtml has no layouts (that is orz-slides); `orz-mdhtml themes` lists the themes',
};

/** The message for a command name orz-mdhtml does not have. */
const unknownCommand = (word: string): string =>
  `${OTHER_COMMANDS[word.toLowerCase()] ?? `orz-mdhtml has no command "${word}"`}. Commands: ${Object.keys(COMMANDS).join(', ')} (see \`orz-mdhtml --help\`)${existsSync(`${word}.md`) ? `; to assemble ${word}.md: \`orz-mdhtml assemble ${word}.md\`` : ''}`;

export function main(argv: string[]): number {
  const json = argv.includes('--json');
  let command = 'assemble';
  try {
    const first = argv[0];
    if (first === undefined) { process.stderr.write(`${USAGE}\n`); return EXIT_USAGE; }
    if (first === '-h' || first === '--help' || first === 'help') {
      const topic = first === 'help' ? argv[1] : undefined;
      if (topic !== undefined && !HELP[topic] && looksLikeCommand(topic)) { command = topic; throw new CliError(unknownCommand(topic), EXIT_USAGE); }
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
    else if (looksLikeCommand(first) && !existsSync(first)) {
      // `orz-mdhtml templates --help`: a word that names no file is a command this tool does not have, not a text
      command = first;
      throw new CliError(unknownCommand(first), EXIT_USAGE);
    }
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
    if (json) process.stdout.write(`${JSON.stringify({ ok: false, command, error: err.message, reason: err.reason, ...(err.next ? { next: err.next } : {}), exitCode: err.code }, null, 2)}\n`);
    else process.stderr.write(`orz-mdhtml ${command}: ${err.message}\n${err.code === EXIT_USAGE && HELP[command] ? `(see orz-mdhtml ${command} --help)\n` : ''}`);
    return err.code;
  }
}

// A reader that stops early (`assemble x.md -o - | head -c 10`) closes the pipe: that is not a failure of
// this command — exit quietly instead of printing Node's "Unhandled 'error' event" stack (STATUS D-77).
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EPIPE') process.exit(process.exitCode ?? EXIT_OK);
    throw e;
  });
}

process.exitCode = main(process.argv.slice(2));
