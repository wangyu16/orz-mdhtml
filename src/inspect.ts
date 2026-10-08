/**
 * `inspect`: a JSON-able diagnosis of a text or a file, for agents and tools
 * (REBUILD §3a, owner decision 1): what it is, which format and shell, its
 * identity and header lint, whether it is a legacy 0.x file, and what to do.
 *
 * Isomorphic and deterministic: no Node built-ins, no clock, no randomness.
 */
import { extract, readDocument, kindFromFilename, type Kind, type Lint } from 'orz-markdown/carrier';
import { compareSemver } from 'orz-markdown/carrier/shell';
import { cdnBundleUrl, FORMATS, storedText } from './assemble.js';
import { readLegacy } from './legacy.js';
import { sha256 } from './sha256.js';
import { VERSION } from './version.js';

/** The report {@link inspect} returns (plain JSON data). */
export interface InspectReport {
  /** This tool: the shell it writes and the text formats it reads and writes. */
  tool: { name: 'orz-mdhtml'; version: string; formats: number[] };
  /**
   * `text` (a text twin or any Markdown), `assembled` (a format-1 file),
   * `legacy` (an orz-mdhtml 0.x file), `html` (HTML that is neither).
   */
  input: 'text' | 'assembled' | 'legacy' | 'html';
  /** The document kind (`md`, `slides`, `paged`); `null` when there is no document. */
  kind: Kind | null;
  /** The text format; `null` when there is no format-1 document (legacy files are pre-format). */
  format: number | null;
  /** Whether this tool may assemble, edit and save it (kind `md`, a format it writes). */
  writable: boolean;
  /** The assembled file's markers (`#orz-shell`, generator meta), and how its shell compares to this tool's. */
  shell: { version: string; generator: string | null; delivery: string; relation: 'same' | 'older' | 'newer' | 'unknown' } | null;
  /** What a legacy 0.x file holds outside its source. */
  legacy: { version: string | null; generator: string | null; delivery: 'inline' | 'cdn' | null; docId: string | null; theme: string | null; title: string | null; metaKeys: string[] } | null;
  /** The header `uid` when valid (FC-18 §10). */
  uid: string | null;
  /** The derived title (FC-18 §8.1). */
  title: string | null;
  /** The header `theme`, when set. */
  theme: string | null;
  /** The header: present, legacy form (`meta`, `meta+document`), keys in source order. */
  header: { present: boolean; legacy: null | 'meta' | 'meta+document'; keys: string[] } | null;
  /** Number of resolved includes stored in `#orz-includes` (0 for a text). */
  includes: number;
  /**
   * The SHA-256 (hex) of the text the input holds — a text's exact UTF-8
   * bytes (for a text twin read as it is: `sha256sum x.md`), the text inside
   * an assembled or 0.x file — or null (HTML that holds no orz text). Pass it
   * as `orz-mdhtml assemble --replaces` / `extract --replaces` (claim T.12).
   */
  sha256: string | null;
  /** Header lint findings of the text (FC-18 §5; the kit's `lintHeader`). */
  lint: Lint[];
  /** What to do next, in plain sentences (commands included). */
  advice: string[];
  /**
   * An assembled file's structure (FC-18 §8): whether the `#orz-src` island and
   * the document (`</html>`) are closed, and the engine — `same` (the inline
   * engine is this release's bundle, byte for byte), `different` (it is not:
   * altered or cut), `unverified` (another shell version, or no reference
   * bundle given), `cdn` (loaded from jsDelivr: the `src` is checked
   * instead), `missing` (no `#orz-engine`). `null` for anything else.
   */
  checks: { island: 'closed' | 'unclosed'; end: 'closed' | 'unclosed'; engine: 'same' | 'different' | 'unverified' | 'cdn' | 'missing' } | null;
  /**
   * The sibling twin (FC-18 §3: `x.md` ↔ `x.md.html`), when the caller passed
   * it (the CLI does):
   * - `name`: its path (as the input was named);
   * - `holds`: `same` (the same text, compared as a file stores it), a
   *   `different` one, or `none` (no orz text: not an orz file, or a text
   *   where a file was expected);
   * - `newer`: which of the two was modified last — `input` (the inspected
   *   file), `twin` (the sibling), `same-time`, or `unknown` (not given);
   * - `sha256`: the SHA-256 of the text the twin holds (null for `none`) —
   *   the `--replaces` token for it;
   * - `earlier` (only with `holds: "different"`): the `.md.html`'s text is a
   *   known earlier state of the text twin (`git-head`, `git-index`,
   *   `git-log`, `cache`: the CLI checked it), so `orz-mdhtml assemble`
   *   replaces it without `--force`.
   */
  twin: { name: string; holds: 'same' | 'different' | 'none'; newer: 'input' | 'twin' | 'same-time' | 'unknown'; sha256: string | null; earlier?: 'git-head' | 'git-index' | 'git-log' | 'cache' } | null;
  /** Things found but not understood; nothing was changed because of them. */
  notes: string[];
}

/** Options of {@link inspect}. */
export interface InspectOptions {
  /** The input's file name: decides the kind of a text (FC-18 §3). */
  filename?: string;
  /**
   * The sibling twin's content (a text's `.md.html`, a file's `.md`) and which
   * of the two was modified last, for the twin check (the CLI reads it; this
   * module reads no files). `earlier`: the CLI found the `.md.html`'s text to
   * be an earlier state of the text twin (its last commit or staged version in
   * git, or what the CLI itself last wrote there).
   */
  twin?: { name: string; content: string; newer?: 'input' | 'twin' | 'same-time' | 'unknown'; earlier?: 'git-head' | 'git-index' | 'git-log' | 'cache' | null };
  /**
   * This release's browser bundle (the Node library passes it): an inline
   * file of this shell version is compared with it (`checks.engine`).
   */
  engineSource?: string;
}

/** HTML is recognised by its start: an optional BOM and whitespace, then `<!doctype html` or `<html`. */
const looksHtml = (s: string): boolean => /^\uFEFF?\s*(?:<!doctype\s+html|<html[\s>])/i.test(s.slice(0, 1024));

/** A file name as a shell word (quoted when it holds anything but safe characters). */
const sh = (name: string): string => (/^[\w./@%+=:,-]+$/.test(name) ? name : `'${name.replace(/'/g, `'\\''`)}'`);

/** `x.md` → `x.browser.md` (where a file's other text goes for a merge). */
export const browserName = (textName: string): string => `${textName.replace(/\.md$/i, '')}.browser.md`;

const generatorOf = (html: string): string | null => {
  const head = html.slice(0, Math.max(0, html.search(/<body[\s>]/i)));
  return /<meta\s+name=["']generator["']\s+content=["']([^"']*)["']/i.exec(head)?.[1] ?? null;
};

/**
 * Inspect a text or an `.md.html` file (any version). `filename`, when given,
 * decides the kind of a text (FC-18 §3).
 */
export function inspect(input: string, options: InspectOptions = {}): InspectReport {
  const report: InspectReport = {
    tool: { name: 'orz-mdhtml', version: VERSION, formats: [...FORMATS] },
    input: 'text',
    kind: null,
    format: null,
    writable: false,
    shell: null,
    legacy: null,
    uid: null,
    title: null,
    theme: null,
    header: null,
    includes: 0,
    sha256: null,
    lint: [],
    advice: [],
    checks: null,
    twin: null,
    notes: [],
  };
  let text: string;
  let kind: Kind | undefined;
  const html = looksHtml(input);
  /** This input's name in advice (as the caller named it). */
  const self = sh(options.filename ?? (html ? 'file.md.html' : 'file.md'));
  if (!html && input.trim() === '' && options.filename !== undefined && /\.html?$/i.test(options.filename)) {
    // an empty (or blank) .md.html: not an empty text — a damaged or unfinished file
    report.input = 'html';
    report.advice.push(`the file is empty (${input.length === 0 ? 'no bytes' : 'only white space'}): a damaged or unfinished file, it holds no text — recover the text from its text twin or a backup (${options.filename}~), then assemble again`);
    return report;
  }
  if (html) {
    const legacy = readLegacy(input);
    if (legacy) {
      report.input = 'legacy';
      report.legacy = {
        version: legacy.version,
        generator: legacy.generator,
        delivery: legacy.delivery,
        docId: legacy.docId,
        theme: legacy.theme ?? legacy.defaultTheme,
        title: legacy.title,
        metaKeys: legacy.meta ? Object.keys(legacy.meta) : [],
      };
      report.notes.push(...legacy.notes);
      const twinText = options.twin && !looksHtml(options.twin.content) ? options.twin : null;
      if (twinText) {
        // a 0.x file next to a text twin (often a 0.x text): upgrade must not replace it — its text goes to another name
        const other = sh(browserName(twinText.name));
        report.advice.push(
          `legacy orz-mdhtml ${legacy.version ?? '0.x'} file (experimental, before text format 1; no compatibility shim) next to the text ${twinText.name}: run \`orz-mdhtml upgrade ${self} --text ${other}\` — it writes this file's format-1 text (the source exactly, its metadata, title and theme moved into a header) to ${browserName(twinText.name)} and re-assembles this file from it; then compare ${browserName(twinText.name)} with ${twinText.name}, merge what you keep into ${twinText.name} (keep the new header), and \`orz-mdhtml assemble ${sh(twinText.name)} --replaces\` followed by the sha256 upgrade printed (it replaces this file only while it holds that text). The file's own "Framework 1.0.0 available" banner cannot update it (it ends with "check your connection")`,
        );
      } else {
        report.advice.push(
          `legacy orz-mdhtml ${legacy.version ?? '0.x'} file (experimental, before text format 1; no compatibility shim): run \`orz-mdhtml upgrade ${self}\` for its format-1 text twin and a new file; the source is kept exactly and its metadata, title and theme move into the header. The file's own "Framework 1.0.0 available" banner cannot update it (it ends with "check your connection"); \`orz-mdhtml upgrade\` is the way`,
        );
      }
      text = legacy.text;
      kind = 'md';
    } else {
      const ex = extract(input);
      if (!ex) {
        report.input = 'html';
        report.advice.push('an HTML file without an #orz-src island: not an orz document; nothing to extract');
        return report;
      }
      if (ex.shell === '') {
        report.input = 'html';
        report.notes.push('an #orz-src island without #orz-shell and without orz-mdhtml 0.x markers: an unknown writer');
        report.advice.push('`orz-mdhtml extract` reads the island as format 1 would; check the text before relying on it');
        return report;
      }
      report.input = 'assembled';
      const cmp = ex.kind === 'md' ? compareSemver(ex.shell, VERSION) : null;
      const relation = cmp === -1 ? 'older' : cmp === 0 ? 'same' : cmp === 1 ? 'newer' : 'unknown';
      report.shell = { version: ex.shell, generator: generatorOf(input), delivery: ex.delivery, relation };
      report.includes = ex.includes ? Object.keys(ex.includes).length : 0;
      if (ex.kind === 'md') report.checks = structureOf(input, ex.shell, ex.delivery, options.engineSource);
      if (report.checks) {
        const c = report.checks;
        const recovered = sh(`${(options.filename ?? 'file.md.html').replace(/\.md\.html$/i, '').replace(/\.html?$/i, '')}.recovered.md`);
        if (c.island === 'unclosed') report.advice.push(`the #orz-src island is not closed (the file was cut off): the text may be incomplete — recover what you can: \`orz-mdhtml extract ${self} -o ${recovered}\`, compare it with the text twin or a backup, and keep the complete text; do not re-assemble or upgrade this file from it (\`upgrade\` refuses without --force)`);
        else if (c.end === 'unclosed') report.advice.push(`the file does not end with </html> (cut off or damaged): its text is complete, but the page may not work; \`orz-mdhtml upgrade ${self}\` re-assembles it`);
        if (c.island === 'closed' && (c.engine === 'different' || c.engine === 'missing')) report.advice.push(`the inline engine is ${c.engine === 'missing' ? 'missing' : `not orz-mdhtml ${ex.shell}'s release bundle (altered or cut)`}: \`orz-mdhtml upgrade ${self}\` re-assembles the file with this release's engine; the text does not change`);
        if (c.engine === 'unverified' && ex.delivery === 'inline' && relation !== 'same') report.notes.push(`the inline engine was not verified: this tool holds the bundle of ${VERSION}, the file's shell is ${ex.shell}`);
      }
      if (ex.kind === 'md') {
        if (relation === 'older' && report.checks?.island !== 'unclosed') report.advice.push(`made by orz-mdhtml ${ex.shell}, older than this tool (${VERSION}): \`orz-mdhtml upgrade ${self}\` re-assembles it with the newest shell; the text does not change`);
        if (relation === 'newer') report.advice.push(`made by a newer orz-mdhtml (${ex.shell}) than this tool (${VERSION}): re-assembling here would write an older shell (\`assemble\` and \`upgrade\` refuse without --force); use \`npx orz-mdhtml@latest\``);
      }
      text = ex.text;
      kind = ex.kind;
    }
  } else {
    text = input;
    kind = options.filename ? (kindFromFilename(options.filename) ?? undefined) : undefined;
  }

  report.sha256 = sha256(text);
  const doc = readDocument(text, kind ? { kind } : {});
  report.kind = doc.kind;
  report.format = report.input === 'legacy' ? null : doc.format;
  report.uid = doc.meta.uid ?? null;
  report.title = doc.title;
  report.theme = doc.theme ?? null;
  report.header = doc.header ? { present: true, legacy: doc.header.legacy, keys: [...doc.header.keys] } : { present: false, legacy: null, keys: [] };
  report.lint = doc.lint;
  const newer = doc.format > Math.max(...FORMATS);
  report.writable = doc.kind === 'md' && !newer && report.input !== 'legacy' && report.shell?.relation !== 'newer' && report.checks?.island !== 'unclosed';

  if (doc.kind !== 'md') report.advice.push(`an orz ${doc.kind} document: use orz-${doc.kind} (\`npx orz-${doc.kind}\`)`);
  if (newer) report.advice.push(`text format ${doc.format} is newer than this tool reads and writes (format ${FORMATS.join(', ')}): read-only here; use a newer orz-mdhtml (\`npx orz-mdhtml@latest\`)`);
  const errors = doc.lint.filter((l) => l.level === 'error');
  if (errors.length > 0) report.advice.push(`fix the header lint errors in the text (${[...new Set(errors.map((l) => l.code))].join(', ')}), then assemble again`);
  if (report.input !== 'legacy' && doc.header?.legacy) report.advice.push('the header is a legacy `kind: meta` block: the first header edit (any tool) converts it to `kind: document`; nothing to do by hand');
  if (options.twin && (report.input === 'text' || report.input === 'assembled' || report.input === 'legacy') && doc.kind === 'md') {
    report.twin = twinCheck(report.input === 'text' ? 'text' : 'assembled', text, options.twin);
    const t = report.twin;
    const tn = sh(t.name);
    const twinLegacy = report.input === 'text' && looksHtml(options.twin.content) && readLegacy(options.twin.content) !== null;
    if (report.input === 'legacy') {
      // the advice above already names upgrade --text
    } else if (t.holds === 'different' && twinLegacy) {
      report.advice.push(`${t.name} is a legacy orz-mdhtml 0.x file holding a different text than this text twin: \`orz-mdhtml upgrade ${tn} --text ${sh(browserName(options.filename ?? 'file.md'))}\` gives its format-1 text (and makes it a file of this version); compare and merge that into ${options.filename ?? 'this text'}, then \`orz-mdhtml assemble ${self} --replaces\` followed by the sha256 upgrade printed (it replaces ${t.name} only while it holds that text). Not \`extract\`: it does not read 0.x files`);
    } else if (t.holds === 'different' && options.twin.earlier) {
      const source = { 'git-head': 'its last commit', 'git-index': 'its staged version', 'git-log': 'one of its recent commits', cache: 'what orz-mdhtml last wrote there' }[options.twin.earlier];
      t.earlier = options.twin.earlier;
      if (report.input === 'text') report.advice.push(`${t.name} holds an earlier text of this text twin (${source}): \`orz-mdhtml assemble ${self}\` replaces it, no --force needed`);
      else report.advice.push(`this file holds an earlier text of ${t.name} (${source}): \`orz-mdhtml assemble ${tn}\` replaces it, no --force needed`);
    } else if (t.holds === 'different') {
      const newerNote = t.newer === 'twin' ? `, and ${t.name} was modified later` : t.newer === 'input' ? `; this file was modified later` : '';
      if (report.input === 'text') {
        report.advice.push(`${t.name} holds a different text than this text twin${newerNote}. If it has changes this text lacks (saved in the browser), bring them in first: \`orz-mdhtml extract ${tn} -o ${sh(browserName(options.filename ?? 'file.md'))}\` and merge; when this text has everything, \`orz-mdhtml assemble ${self} --replaces ${t.sha256}\` replaces it only if it still holds that text (or \`--force\`, which keeps it as ${t.name}~)`);
      } else {
        report.advice.push(`the text twin ${t.name} holds a different text than this file${newerNote}. If this file has changes the twin lacks (saved in the browser), \`orz-mdhtml extract ${self} -o ${sh(browserName(t.name))}\` and merge them into ${t.name}; then \`orz-mdhtml assemble ${tn} --replaces ${report.sha256}\` (it replaces this file only if it still holds this text). If ${t.name} holds no edit you want to keep, \`orz-mdhtml extract ${self} --replaces ${t.sha256}\` replaces it with this file's text`);
      }
    } else if (t.holds === 'none' && report.input === 'text') {
      report.advice.push(`${t.name} exists but is not an orz file: \`orz-mdhtml assemble\` will not replace it without --force`);
    }
  }
  if (report.input === 'text' && doc.kind === 'md' && !newer && report.twin?.holds !== 'different') report.advice.push(`a text twin: \`orz-mdhtml assemble ${self}\` makes its .md.html`);
  return report;
}

/** The text an `.md.html` holds (format 1, or a 0.x file's source), or null. */
function heldText(html: string): string | null {
  if (!looksHtml(html)) return null;
  const legacy = readLegacy(html);
  if (legacy) return legacy.text;
  const ex = extract(html);
  return ex && ex.shell !== '' ? ex.text : null;
}

function twinCheck(input: 'text' | 'assembled', text: string, twin: NonNullable<InspectOptions['twin']>): NonNullable<InspectReport['twin']> {
  const newer = twin.newer ?? 'unknown';
  if (input === 'text') {
    const held = heldText(twin.content);
    if (held === null) return { name: twin.name, holds: 'none', newer, sha256: null };
    return { name: twin.name, holds: held === storedText(text) ? 'same' : 'different', newer, sha256: sha256(held) };
  }
  // the input is a file: the twin is a text
  if (looksHtml(twin.content) && heldText(twin.content) !== null) return { name: twin.name, holds: 'none', newer, sha256: null };
  return { name: twin.name, holds: storedText(twin.content) === text ? 'same' : 'different', newer, sha256: sha256(twin.content) };
}

/** The first `<script …>` start tag whose attributes match, with its content's bounds (raw text: up to the first `</script`). */
function scriptElement(html: string, idValue: string): { attrs: string; start: number; end: number | null } | null {
  const open = new RegExp(`<script\\b([^>]*\\bid\\s*=\\s*["']?${idValue}["']?[^>]*)>`, 'i').exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const close = html.slice(start).search(/<\/script/i);
  return { attrs: open[1], start, end: close < 0 ? null : start + close };
}

/** The structural checks of an assembled md file (see {@link InspectReport.checks}). */
function structureOf(html: string, shell: string, delivery: string, engineSource: string | undefined): NonNullable<InspectReport['checks']> {
  const island = scriptElement(html, 'orz-src');
  const end = /<\/html\s*>\s*$/i.test(html) ? 'closed' : 'unclosed';
  const engineEl = scriptElement(html, 'orz-engine');
  let engine: NonNullable<InspectReport['checks']>['engine'];
  if (!engineEl) engine = 'missing';
  else if (delivery === 'cdn' || /\bsrc\s*=/i.test(engineEl.attrs)) {
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(engineEl.attrs)?.[1];
    engine = src === cdnBundleUrl(shell) && engineEl.end !== null ? 'cdn' : 'different';
  } else if (engineEl.end === null) engine = 'different';
  else if (engineSource === undefined || shell !== VERSION) engine = 'unverified';
  else engine = html.slice(engineEl.start, engineEl.end) === engineSource ? 'same' : 'different';
  return { island: island && island.end !== null ? 'closed' : 'unclosed', end, engine };
}
