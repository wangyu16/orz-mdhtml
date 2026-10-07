/**
 * Shared test helpers: the golden corpus (from the orz-markdown package),
 * hazard texts, an engine stand-in, the legacy fixtures, and real Chrome.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The carrier golden corpus shipped in the orz-markdown package (preferred over the sibling checkout). */
export const CORPUS = ['node_modules/orz-markdown/tests/carrier-corpus', '../orz-markdown/tests/carrier-corpus'].find((p) => existsSync(join(p, 'manifest.json')))!;

export interface CorpusEntry {
  path: string;
  kind: 'md' | 'slides' | 'paged';
  hasHeader: boolean;
  legacyHeader: boolean;
  byteSensitive: boolean;
  header: { title: string | null; uid: string | null; theme: string | null };
  derivedTitle: string;
  includes?: Record<string, string>;
}

const manifest = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8')) as { files: CorpusEntry[] };

/** Every corpus entry of a kind, with its exact text (read as UTF-8, BOM kept). */
export function corpus(kind: CorpusEntry['kind'] = 'md'): Array<CorpusEntry & { text: string }> {
  return manifest.files
    .filter((f) => f.kind === kind)
    .map((f) => ({ ...f, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(readFileSync(join(CORPUS, f.path))) }));
}

/** Hazard texts (FC-18 §11): consistent line endings, no NUL or lone surrogate, so law 1 applies. */
export const HAZARDS: Readonly<Record<string, string>> = {
  empty: '',
  'crlf-header': '{{nyml\r\nkind: document\r\ncarrier: md\r\ntitle: CR LF\r\nuid: doc-hazard0crlf01\r\n}}\r\n\r\n# CR LF\r\n\r\ntrailing spaces  \r\n',
  cr: '{{nyml\rkind: document\rtitle: Classic Mac\r}}\r\rclassic line ends\r',
  bom: '\uFEFF# BOM first\n\ntext\n',
  'bom-only': '\uFEFF',
  'bom-crlf': '\uFEFF{{nyml\r\nkind: document\r\ntitle: BOM and CR LF\r\n}}\r\n\r\nbody\r\n',
  astral: '# 𝒳 and 👩‍🔬\n\n𠀀 𝔸𝔹ℂ — 漢字 — עברית\u200f — e\u0301\n',
  'script-close': '# </script><script>alert(1)</script> <SCRIPT src=x> </ScRiPt > <\\/script> <\\\\script>\n\n```html\n</script>\n```\n\n<!-- a comment --> --> <!-- <!--\n',
  'header-script-close': '{{nyml\nkind: document\ntitle: a </script> title\ndescription: <script>x</script>\n}}\n\nbody </script\n',
  'no-final-newline': '# Title\n\nno final newline',
  whitespace: '\t\n   \n\t# indented\n  \n\n\n',
  'long-line': `${'word '.repeat(20_000)}\n`,
  'reserved-ids': '<div id="orz-src">a fake island</div>\n<script id="orz-shell">{"kind":"paged"}</script>\n',
  'legacy-island-escape': 'already escaped the 0.x way: <\\/script> and <\\script>\n',
};

/** A script-safe engine stand-in for inline assembly (the real bundle comes in rebuild step 3). */
export const ENGINE = 'window.__orzEngineStandIn=(window.__orzEngineStandIn||0)+1;';

/** Legacy 0.x files: the 0.8 example (metadata.md and its file) and the fixtures copied from the local out/ folder. */
export const LEGACY_FILES: Readonly<Record<string, string>> = {
  'fixtures/metadata.md.html': 'tests/fixtures/legacy/metadata.md.html',
  'fixtures/sample.md.html': 'tests/fixtures/legacy/sample.md.html',
  'fixtures/example.md.html': 'tests/fixtures/legacy/example.md.html',
};

export const read = (path: string): string => readFileSync(path, 'utf8');

/**
 * The legacy source, read independently of src/legacy.ts: the island's
 * content (the 0.x writer always wrote this exact start tag), `<\/script`
 * unescaped, the writer's `\n…\n` wrapper removed.
 */
export function legacySourceOf(html: string): string {
  const open = '<script type="text/markdown" id="orz-src">';
  const at = html.indexOf(open);
  if (at < 0) throw new Error('no 0.x island');
  const start = at + open.length;
  const end = html.replace(/[A-Z]/g, (c) => c.toLowerCase()).indexOf('</script', start);
  return html.slice(start, end).replace(/<\\\/(script)/gi, '</$1').replace(/^\n/, '').replace(/\n$/, '');
}

/** Replace the island of a real 0.x file with `source`, written the 0.x way. */
export function withLegacySource(html: string, source: string): string {
  const open = '<script type="text/markdown" id="orz-src">';
  const at = html.indexOf(open);
  const start = at + open.length;
  const end = html.replace(/[A-Z]/g, (c) => c.toLowerCase()).indexOf('</script', start);
  return html.slice(0, start) + '\n' + source.replace(/<\/(script)/gi, '<\\/$1') + '\n' + html.slice(end);
}

type Browser = import('playwright-core').Browser;

/** Real Chrome through playwright-core, or null when Chrome is not installed (the test then skips). */
export async function launchChrome(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return null;
  }
}
