/**
 * KIND-SPECIFIC (md): the renderer of the read view, the editor preview and
 * `renderPreview` — orz-markdown's `renderMarkdownPreview` (body without its
 * header, twin links, `data-src-line` anchors) and, when the host or the file
 * can resolve URL includes, `renderMarkdownPreviewWithIncludes`.
 *
 * Includes (FC-18 §8.3, D4): an assembled file carries what its last
 * assembly resolved in `#orz-includes` — file includes under the path written
 * in the directive, URL includes under the URL. A page cannot read local files
 * or (standalone) fetch URLs (RULES §5.3), so this renderer reads both from
 * that record: URL includes through `fetchInclude` (`prepareSources`), file
 * includes through the parser's host-supplied reader (`env.readFile` with a
 * virtual root `/`). A connected host's resolution of a URL wins
 * (spec/shell-runtime.md §5); the record is the fallback.
 *
 * KIT GAP (reported): orz-markdown 2.1.0 has no renderer that takes the
 * `#orz-includes` record (`{ target → text }`) itself; this module adapts it
 * to the parser's `readFile` env here.
 *
 * KIT GAP (reported): `prepareSources` resolves `{{markdown URL}}` and
 * `{{md-include URL}}` but not the `{{md URL}}` alias, which the parser's
 * include plugin accepts and the golden corpus records (md/includes.md). Until
 * the kit resolves it, `withUrlAlias` hands such directive lines (outside
 * fenced code; same line count, so the anchors hold) to `prepareSources` under
 * the `md-include` alias — the same plugin, which renders nothing unresolved.
 *
 * KIT GAP (reported): `renderMarkdownPreviewWithIncludes` does not pass its
 * render env to `prepareSources` as `includeEnv`, and `prepareSources` keeps
 * every URL directive of a document with a live file include when it has no
 * `includeEnv` — so a file with both kinds (md/includes.md) never shows its
 * URL includes. `withBothIncludes` runs the same steps with `includeEnv`
 * (expand the body, render, map the anchors back as the kit does) instead of
 * the kit's function; it goes back to `renderMarkdownPreviewWithIncludes`
 * when the kit passes the env.
 */
import { withoutHeader } from 'orz-markdown/carrier';
import { renderMarkdownPreview } from 'orz-markdown/carrier/editor';
import { prepareSources } from 'orz-markdown';

/** What a render may use besides the text (the editor shell's `RenderContext`, plus the file's includes). */
export interface MdRenderContext {
  /** URL (or path) → text, or null: the host's include resolution (FC-19 `hooks.fetchInclude`). */
  fetchInclude?(target: string): Promise<string | null>;
  /** Accepted for the shell's `render(text, ctx)` signature; the shell rewrites assets itself. */
  resolveAsset?(path: string): string;
  /** `false` renders links as written (the host resolves them); default `true` (twin links). */
  twinLinks?: boolean;
  /** A per-shell cache for fetched includes. */
  cache?: Map<string, unknown>;
  /** Resolved includes (the file's `#orz-includes`): target as written → text. */
  includes?: Readonly<Record<string, string>>;
}

const isUrl = (t: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(t);

/** POSIX-resolve a relative include target against the virtual root `/` (as the parser does without `node:path`). */
function rootPath(target: string): string {
  const out: string[] = [];
  for (const seg of target.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return `/${out.join('/')}`;
}

/**
 * The parser env for file includes: read from the record (virtual root `/`);
 * an include the record lacks renders nothing, as it does in any page. Always
 * given, so `prepareSources` can judge URL includes next to file includes.
 */
function fileIncludeEnv(includes: Readonly<Record<string, string>> | undefined): Record<string, unknown> {
  const files = new Map<string, string>();
  for (const key of Object.keys(includes ?? {})) {
    if (!isUrl(key) && typeof includes![key] === 'string') files.set(rootPath(key), includes![key]);
  }
  return { markdownBasePath: '/', readFile: (abs: string): string | null => files.get(abs) ?? null };
}

/**
 * The URL-include resolver: the host's first (fresher; it owns the trust
 * policy), then the file's record. Undefined when neither can resolve.
 */
function urlResolver(ctx: MdRenderContext): ((url: string) => Promise<string | null>) | undefined {
  const rec = ctx.includes;
  const recorded = rec ? Object.keys(rec).filter(isUrl) : [];
  const host = ctx.fetchInclude;
  if (!host && recorded.length === 0) return undefined;
  return async (url: string): Promise<string | null> => {
    if (host) {
      try {
        const t = await host(url);
        if (typeof t === 'string') return t;
      } catch { /* the record, if any */ }
    }
    return rec && Object.prototype.hasOwnProperty.call(rec, url) && typeof rec[url] === 'string' ? rec[url] : null;
  };
}

const URL_ALIAS = /^( {0,3})\{\{md(\s+[a-z][a-z0-9+.-]*:\/\/[^\s}]+\s*\}\})[ \t]*$/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** `{{md URL}}` directive lines outside fenced code → `{{md-include URL}}` (see the module comment). */
function withUrlAlias(text: string): string {
  if (!/\{\{md\s+[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  const lines = text.split(/(\r\n|\r|\n)/);
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) { fence = f[1]; continue; }
    const m = URL_ALIAS.exec(line);
    if (m) lines[i] = `${m[1]}{{md-include${m[2]}`;
  }
  return lines.join('');
}

/** Line breaks in a string (CR LF, CR and LF each count once). */
function linesIn(s: string): number {
  return (s.match(/\r\n|\r|\n/g) ?? []).length;
}

type Base = { twinLinks?: boolean; env?: Record<string, unknown>; cache?: Map<string, unknown> };

/** The kit's include rendering with `includeEnv` passed to `prepareSources` (see the module comment). */
async function withBothIncludes(text: string, base: Base, fetchInclude: (url: string) => Promise<string | null>): Promise<string> {
  const cache = base.cache;
  const fetcher = (url: string): Promise<string | null> => {
    const key = `orz-include:${url}`;
    const hit = cache?.get(key) as Promise<string | null> | undefined;
    if (hit) return hit;
    const p = Promise.resolve().then(() => fetchInclude(url)).then((t) => (typeof t === 'string' ? t : null), () => null);
    cache?.set(key, p);
    void p.then((t) => { if (t === null && cache?.get(key) === p) cache.delete(key); });
    return p;
  };
  const { body, offset } = withoutHeader(text);
  const expanded = await prepareSources(body, { fetcher, ...(base.env ? { includeEnv: base.env } : {}) });
  if (expanded === body) return renderMarkdownPreview(text, base);
  const head = text.slice(0, offset);
  const headLines = linesIn(head);
  // expanded line → body line: the common head and tail are exact, the changed middle anchors at its start (as the kit maps)
  const a = body.split(/\r\n?|\n/);
  const b = expanded.split(/\r\n?|\n/);
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) same++;
  let tail = 0;
  while (tail < a.length - same && tail < b.length - same && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const shift = b.length - a.length;
  const map = (l: number): number => (l < same ? l : l >= b.length - tail ? l - shift : same);
  const html = renderMarkdownPreview(head + expanded, base);
  return html.replace(/ data-src-line="(\d+)"/g, (_m, n: string) => {
    const l = Number(n) - headLines;
    return ` data-src-line="${l < 0 ? Number(n) : map(l) + headLines}"`;
  });
}

/** Render an md text to the article's inner HTML (synchronous when no URL include can be resolved). */
export function renderMd(text: string, ctx: MdRenderContext = {}): string | Promise<string> {
  const base: Base = { ...(ctx.twinLinks === false ? { twinLinks: false } : {}), env: fileIncludeEnv(ctx.includes), ...(ctx.cache ? { cache: ctx.cache } : {}) };
  const fetchInclude = urlResolver(ctx);
  if (!fetchInclude) return renderMarkdownPreview(text, base);
  return withBothIncludes(withUrlAlias(text), base, fetchInclude);
}
