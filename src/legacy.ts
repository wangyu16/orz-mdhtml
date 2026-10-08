/**
 * Legacy orz-mdhtml 0.x files (experimental, before text format 1): reading
 * them and upgrading them to a format-1 text and file. Owner decision 1
 * (REBUILD §3a): no compatibility shim — `upgrade` and `inspect` are the way
 * forward.
 *
 * A 0.x file (written by the 0.x `src/template.ts` + `assets/app.js`, removed in 1.0):
 * - the source in `<script type="text/markdown" id="orz-src">`, written as
 *   `"\n" + source + "\n"` with every `</script` (any case) as `<\/script`
 *   (and nothing else escaped); the in-file save writes the same;
 * - the generator says `orz-mdhtml` (no version) and the file has no
 *   `#orz-shell`; the config is `window.__ORZ_MDHTML__ = {…}` (rendererVersion,
 *   docId, defaultTheme, …);
 * - a `{{nyml kind: meta}}` block was consumed at generation: its DocMeta is
 *   in `#orz-meta` (and `<head>`), not in the island; a block the user typed
 *   into the editor later stays in the island;
 * - the reader's theme choice, once saved, is `data-theme` on `<html>`;
 *   `<title>` is the CLI `--title` (default: the file name), so it becomes
 *   the header `title` only when the text has no title of its own.
 *
 * Isomorphic: no Node built-ins, no clock; randomness only through `mintUid`
 * when the file has no valid id and none is injected.
 */
import { editHeader, extract, mintUid, readDocument, readHeader, withoutHeader, UID_PATTERN, type HeaderChange } from 'orz-markdown/carrier';
import { parseDocMetaIsland, type DocMeta } from 'orz-markdown/doc-meta';
import { compareSemver } from 'orz-markdown/carrier/shell';
import { assemble, type AssembleOptions } from './assemble.js';
import { DEFAULT_THEME, isThemeId } from './themes.js';
import { VERSION } from './version.js';

/** What {@link readLegacy} reads from a 0.x file. */
export interface LegacyFile {
  /** The source as the 0.x runtime read it: the island, unescaped, without the writer's wrapping line breaks. */
  text: string;
  /** Whether the island had the 0.x writer's `\n…\n` wrapper (or `\r\n…\r\n`, a file whose line breaks were converted; otherwise its content is kept exactly). */
  wrapped: boolean;
  /** The generator meta (`orz-mdhtml`), if any. */
  generator: string | null;
  /** The renderer version from the config (`rendererVersion`), if readable. */
  version: string | null;
  /** `inline` / `cdn` from the engine script, if found. */
  delivery: 'inline' | 'cdn' | null;
  /** The config's `docId` (0.x: a UUID), if readable. */
  docId: string | null;
  /** The saved theme choice (`data-theme` on `<html>`), if any. */
  theme: string | null;
  /** The config's `defaultTheme`, if readable. */
  defaultTheme: string | null;
  /** The `<title>` text (entities decoded), if any. */
  title: string | null;
  /** DocMeta from `#orz-meta` in the head, if any. */
  meta: DocMeta | null;
  /** Things found but not understood (reported by `inspect`, never acted on). */
  notes: string[];
}

interface RawElement {
  name: string;
  attrs: string;
  start: number;
  end: number;
}

const RAW_TEXT = new Set(['script', 'style', 'title', 'textarea']);

/** ASCII-only lower case: keeps offsets (String#toLowerCase may change the length). */
const asciiLower = (s: string): string => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

/**
 * The raw-text elements of a 0.x file in document order (comments and other
 * raw-text content skipped, so a `<script` written inside a script string is
 * not taken for a tag).
 */
function rawElements(html: string): RawElement[] {
  const lower = asciiLower(html);
  const out: RawElement[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt + 4);
      if (e < 0) break;
      i = e + 3;
      continue;
    }
    const m = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(html.slice(lt, lt + 64));
    if (!m) {
      i = lt + 1;
      continue;
    }
    const name = asciiLower(m[1]);
    const gt = html.indexOf('>', lt);
    if (gt < 0) break;
    if (!RAW_TEXT.has(name)) {
      i = gt + 1;
      continue;
    }
    let close = -1;
    for (let at = lower.indexOf(`</${name}`, gt + 1); at >= 0; at = lower.indexOf(`</${name}`, at + 1)) {
      const c = lower.charAt(at + name.length + 2);
      if (c === '' || c === '>' || c === '/' || /\s/.test(c)) {
        close = at;
        break;
      }
    }
    out.push({ name, attrs: html.slice(lt + 1 + m[1].length, gt), start: gt + 1, end: close < 0 ? html.length : close });
    if (close < 0) break;
    const end = html.indexOf('>', close);
    i = end < 0 ? html.length : end + 1;
  }
  return out;
}

const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
};

const hasAttr = (attrs: string, name: string): boolean => new RegExp(`(?:^|\\s)${name}(?=[\\s=/]|$)`, 'i').test(attrs);

/** Decode the entities a 0.x writer or a browser's serializer puts in `<title>`. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h: string) => safeCodePoint(parseInt(h, 16)) ?? m)
    .replace(/&#([0-9]+);/g, (m, d: string) => safeCodePoint(parseInt(d, 10)) ?? m)
    .replace(/&(lt|gt|quot|apos|nbsp|amp);/g, (_m, n: string) => ({ lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', amp: '&' })[n] ?? '');
}

function safeCodePoint(n: number): string | null {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : null;
}

/** The 0.x island unescape: exactly the inverse of its writer (`</script` → `<\/script`, any case). */
const legacyUnescape = (s: string): string => s.replace(/<\\\/(script)/gi, '</$1');

/**
 * Read a legacy orz-mdhtml 0.x file; `null` when `html` is not one (no
 * `#orz-src` island, a format-1 `#orz-shell`, or no 0.x marker — the
 * `orz-mdhtml` generator or the `__ORZ_MDHTML__` config).
 */
export function readLegacy(html: string): LegacyFile | null {
  const els = rawElements(html);
  const scripts = els.filter((e) => e.name === 'script');
  if (scripts.some((e) => attr(e.attrs, 'id') === 'orz-shell')) return null;
  const island = scripts.find((e) => attr(e.attrs, 'id') === 'orz-src');
  if (!island) return null;
  const head = html.slice(0, Math.max(0, html.search(/<body[\s>]/i)));
  const gen = /<meta\s+name=["']generator["']\s+content=["']([^"']*)["']/i.exec(head)?.[1] ?? null;
  const configEl = scripts.find((e) => /^\s*window\.__ORZ_MDHTML__\s*=/.test(html.slice(e.start, e.end)));
  if (gen !== 'orz-mdhtml' && !configEl) return null;

  const notes: string[] = [];
  let config: Record<string, unknown> = {};
  if (configEl) {
    const js = html.slice(configEl.start, configEl.end).replace(/^\s*window\.__ORZ_MDHTML__\s*=\s*/, '').replace(/;\s*$/, '');
    try {
      const parsed = JSON.parse(js) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed as Record<string, unknown>;
    } catch {
      notes.push('the 0.x config (window.__ORZ_MDHTML__) is not readable JSON; theme and version were not read from it');
    }
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

  const raw = legacyUnescape(html.slice(island.start, island.end));
  // The 0.x writer wrapped the source in "\n…\n"; a file whose line breaks were
  // converted to CR LF afterwards (an editor, a git checkout) has "\r\n…\r\n".
  const lead = raw.startsWith('\r\n') ? 2 : raw.startsWith('\n') ? 1 : 0;
  const trail = lead === 2 && raw.endsWith('\r\n') ? 2 : raw.endsWith('\n') ? 1 : 0;
  const wrapped = lead > 0 && trail > 0 && raw.length >= lead + trail;
  if (!wrapped) notes.push('the source island lacks the 0.x writer\'s "\\n…\\n" wrapper; its content is kept exactly');
  if (attr(island.attrs, 'type') !== 'text/markdown') notes.push(`the source island's type is ${JSON.stringify(attr(island.attrs, 'type'))}, not text/markdown`);

  const htmlTag = /<html\b([^>]*)>/i.exec(html);
  const theme = htmlTag ? attr(htmlTag[1], 'data-theme') : null;
  const titleEl = els.find((e) => e.name === 'title');
  const engine = scripts.find((e) => attr(e.attrs, 'data-orz-asset') === 'engine');

  return {
    text: wrapped ? raw.slice(lead, raw.length - trail) : raw,
    wrapped,
    generator: gen,
    version: str(config['rendererVersion']) ?? str(config['version']),
    delivery: engine ? (hasAttr(engine.attrs, 'src') ? 'cdn' : 'inline') : null,
    docId: str(config['docId']),
    theme: theme === null || theme === '' ? null : theme,
    defaultTheme: str(config['defaultTheme']),
    title: titleEl ? decodeEntities(html.slice(titleEl.start, titleEl.end)).trim() : null,
    meta: parseDocMetaIsland(html),
    notes,
  };
}

/** What {@link upgrade} returns. */
export interface UpgradeResult {
  /** The format-1 text twin. */
  text: string;
  /** Its assembly with this shell. */
  html: string;
  /** `legacy` (a 0.x file) or `format-1` (already format 1: re-assembled with this shell). */
  from: 'legacy' | 'format-1';
  /** Header keys this upgrade wrote, with their values. */
  moved: Record<string, string>;
  /** What was found but not moved, and why. */
  notes: string[];
}

/** Options of {@link upgrade}: the assembly's, and a uid to use instead of minting one (tests). */
export interface UpgradeOptions extends AssembleOptions {
  uid?: string;
  /**
   * Re-assemble a format-1 file whose shell is NEWER than this tool (a
   * downgrade). Default `false`: such a file is refused — an older shell
   * would replace a newer one (use the newer tool, `npx orz-mdhtml@latest`).
   */
  downgrade?: boolean;
}

/** A value the header can hold as a single line (FC-18 §9). */
const writable = (v: string): boolean => v.trim() !== '' && !/[\r\n\u0000]/.test(v) && !v.includes('}}');

/**
 * Upgrade an orz-mdhtml file to text format 1: a legacy 0.x file becomes a
 * format-1 text — its source exactly, with a header that names `carrier: md`,
 * a `uid` (the file's own when it is valid per `UID_PATTERN`, else minted)
 * and the DocMeta, title and theme the 0.x file kept outside its source —
 * and that text's assembly. Keys the text's own header already has are never
 * overwritten; a legacy `kind: meta` header is converted as FC-18 §5 says
 * (the kit's `editHeader`). A format-1 file is re-assembled with this shell.
 *
 * Never loses text: the body after the header is verified to be the legacy
 * source exactly, else it throws. Throws for a file that is neither.
 */
export function upgrade(html: string, options: UpgradeOptions = {}): UpgradeResult {
  const { uid: injected, downgrade, ...assembleOptions } = options;
  const legacy = readLegacy(html);
  if (!legacy) {
    const ex = extract(html);
    if (!ex || ex.shell === '') throw new Error('orz-mdhtml upgrade: not an orz-mdhtml file (no 0.x markers and no format-1 #orz-src/#orz-shell)');
    if (ex.kind !== 'md') throw new Error(`orz-mdhtml upgrade: an orz-${ex.kind} file; use orz-${ex.kind}`);
    if (ex.format > 1) throw new Error(`orz-mdhtml upgrade: text format ${ex.format} is newer than this tool writes (format 1)`);
    if (!downgrade && compareSemver(ex.shell, VERSION) === 1) {
      throw new Error(`orz-mdhtml upgrade: the file's shell (orz-mdhtml ${ex.shell}) is newer than this tool (${VERSION}); upgrading would downgrade it. Use \`npx orz-mdhtml@latest upgrade\`, or pass --force (library: { downgrade: true }) to re-assemble it with this older shell anyway`);
    }
    const includes = assembleOptions.includes ?? ex.includes;
    return { text: ex.text, html: assemble(ex.text, { ...assembleOptions, ...(includes ? { includes } : {}) }), from: 'format-1', moved: {}, notes: [] };
  }

  const source = legacy.text;
  const notes = [...legacy.notes];
  const header = readHeader(source);
  const has = (k: string): boolean => !!header && Object.prototype.hasOwnProperty.call(header.fields, k);
  const changes: Array<[string, string]> = [];
  const add = (key: string, value: string | undefined | null, what: string): void => {
    if (value === undefined || value === null || value.trim() === '' || has(key) || changes.some(([k]) => k === key)) return;
    if (!writable(value)) {
      notes.push(`${what} not moved into the header: the value cannot be a single header line`);
      return;
    }
    changes.push([key, value]);
  };

  add('carrier', 'md', 'carrier');
  if (!has('uid')) {
    const own = [legacy.meta?.uid, legacy.docId].find((u): u is string => typeof u === 'string' && UID_PATTERN.test(u.trim()));
    if (!own && legacy.docId) notes.push(`the 0.x docId ${JSON.stringify(legacy.docId)} is not a valid uid (doc-[0-9a-z]{10,32}); a new uid was minted`);
    add('uid', own?.trim() ?? injected ?? mintUid(), 'uid');
  }
  const meta = legacy.meta ?? {};
  add('title', meta.title, '#orz-meta title');
  // The 0.x `<title>` was the CLI's --title, by default the file name: it is
  // moved only when the text derives no title of its own (no level-1 heading).
  if (!has('title') && !meta.title && legacy.title && legacy.title !== 'Untitled') {
    const derived = readDocument(source, { kind: 'md' }).title;
    if (derived === 'Untitled') add('title', legacy.title, '<title>');
    else if (derived !== legacy.title) notes.push(`the 0.x <title> ${JSON.stringify(legacy.title)} (the CLI --title, by default the file name) was not moved: the text's own heading gives its title`);
  }
  add('author', meta.author, '#orz-meta author');
  add('description', meta.description, '#orz-meta description');
  add('date', meta.date, '#orz-meta date');
  add('keywords', Array.isArray(meta.keywords) ? meta.keywords.join(', ') : undefined, '#orz-meta keywords');
  add('source', meta.source, '#orz-meta source');
  add('license', meta.license?.spdx, '#orz-meta license');
  add('license_name', meta.license?.name, '#orz-meta license name');
  add('license_url', meta.license?.url, '#orz-meta license url');
  const chosen = legacy.theme ?? (legacy.defaultTheme !== DEFAULT_THEME ? legacy.defaultTheme : null);
  if (chosen && !isThemeId(chosen)) notes.push(`theme ${JSON.stringify(chosen)} is not an orz-markdown theme; not moved`);
  else add('theme', chosen, 'theme');

  let text = source;
  const moved: Record<string, string> = {};
  for (const [key, value] of changes) {
    try {
      text = editHeader(text, { [key]: value } satisfies Record<string, HeaderChange>);
      moved[key] = value;
    } catch (e) {
      notes.push(`${key} not moved into the header: ${(e as Error).message}`);
    }
  }

  // Never lose text: what follows the header is the legacy source's body exactly.
  const before = header ? withoutHeader(source).body : source.replace(/^\uFEFF/, '');
  const after = withoutHeader(text).body;
  if (!after.endsWith(before) || after.slice(0, after.length - before.length).trim() !== '') {
    throw new Error('orz-mdhtml upgrade: the upgraded text does not keep the legacy source exactly; nothing was written');
  }
  return { text, html: assemble(text, assembleOptions), from: 'legacy', moved, notes };
}
