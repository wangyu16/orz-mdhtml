/**
 * `inspect`: a JSON-able diagnosis of a text or a file, for agents and tools
 * (REBUILD §3a, owner decision 1): what it is, which format and shell, its
 * identity and header lint, whether it is a legacy 0.x file, and what to do.
 *
 * Isomorphic and deterministic: no Node built-ins, no clock, no randomness.
 */
import { extract, readDocument, kindFromFilename, type Kind, type Lint } from 'orz-markdown/carrier';
import { compareSemver } from 'orz-markdown/carrier/shell';
import { FORMATS } from './assemble.js';
import { readLegacy } from './legacy.js';
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
  /** Header lint findings of the text (FC-18 §5; the kit's `lintHeader`). */
  lint: Lint[];
  /** What to do next, in plain sentences (commands included). */
  advice: string[];
  /** Things found but not understood; nothing was changed because of them. */
  notes: string[];
}

/** HTML is recognised by its start: an optional BOM and whitespace, then `<!doctype html` or `<html`. */
const looksHtml = (s: string): boolean => /^\uFEFF?\s*(?:<!doctype\s+html|<html[\s>])/i.test(s.slice(0, 1024));

const generatorOf = (html: string): string | null => {
  const head = html.slice(0, Math.max(0, html.search(/<body[\s>]/i)));
  return /<meta\s+name=["']generator["']\s+content=["']([^"']*)["']/i.exec(head)?.[1] ?? null;
};

/**
 * Inspect a text or an `.md.html` file (any version). `filename`, when given,
 * decides the kind of a text (FC-18 §3).
 */
export function inspect(input: string, options: { filename?: string } = {}): InspectReport {
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
    lint: [],
    advice: [],
    notes: [],
  };
  let text: string;
  let kind: Kind | undefined;
  if (looksHtml(input)) {
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
      report.advice.push(
        `legacy orz-mdhtml ${legacy.version ?? '0.x'} file (experimental, before text format 1; no compatibility shim): run \`orz-mdhtml upgrade <file>\` for its format-1 text twin and a new file; the source is kept exactly and its metadata, title and theme move into the header`,
      );
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
      if (ex.kind === 'md') {
        if (relation === 'older') report.advice.push(`made by orz-mdhtml ${ex.shell}, older than this tool (${VERSION}): \`orz-mdhtml upgrade <file>\` re-assembles it with the newest shell; the text does not change`);
        if (relation === 'newer') report.advice.push(`made by a newer orz-mdhtml (${ex.shell}) than this tool (${VERSION}): re-assembling here would write an older shell; prefer \`npx orz-mdhtml@latest\``);
      }
      text = ex.text;
      kind = ex.kind;
    }
  } else {
    text = input;
    kind = options.filename ? (kindFromFilename(options.filename) ?? undefined) : undefined;
  }

  const doc = readDocument(text, kind ? { kind } : {});
  report.kind = doc.kind;
  report.format = report.input === 'legacy' ? null : doc.format;
  report.uid = doc.meta.uid ?? null;
  report.title = doc.title;
  report.theme = doc.theme ?? null;
  report.header = doc.header ? { present: true, legacy: doc.header.legacy, keys: [...doc.header.keys] } : { present: false, legacy: null, keys: [] };
  report.lint = doc.lint;
  const newer = doc.format > Math.max(...FORMATS);
  report.writable = doc.kind === 'md' && !newer && report.input !== 'legacy' && report.shell?.relation !== 'newer';

  if (doc.kind !== 'md') report.advice.push(`an orz ${doc.kind} document: use orz-${doc.kind} (\`npx orz-${doc.kind}\`)`);
  if (newer) report.advice.push(`text format ${doc.format} is newer than this tool reads and writes (format ${FORMATS.join(', ')}): read-only here; use a newer orz-mdhtml (\`npx orz-mdhtml@latest\`)`);
  const errors = doc.lint.filter((l) => l.level === 'error');
  if (errors.length > 0) report.advice.push(`fix the header lint errors in the text (${[...new Set(errors.map((l) => l.code))].join(', ')}), then assemble again`);
  if (report.input !== 'legacy' && doc.header?.legacy) report.advice.push('the header is a legacy `kind: meta` block: the first header edit (any tool) converts it to `kind: document`; nothing to do by hand');
  if (report.input === 'text' && doc.kind === 'md' && !newer) report.advice.push('a text twin: `orz-mdhtml assemble <file>` makes its .md.html');
  return report;
}
