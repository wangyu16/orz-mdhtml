/**
 * KIND-SPECIFIC (md): the renderer of the read view and `renderPreview` — the
 * kit's `renderMarkdownPreviewWithIncludes` (orz-markdown `carrier/editor`):
 * the body without its header, twin links, `data-src-line` anchors, file
 * includes from the file's `#orz-includes` record and URL includes from the
 * host's `fetchInclude` first (fresher; it owns the trust policy), then the
 * record (FC-18 §8.3, D4; spec/shell-runtime.md §5); twin links with the
 * file's (or the host's) naming, FC-18 §8.2. The editor renders with
 * the same kit function (a missing include record counts as an empty one).
 */
import type { TwinNaming } from 'orz-markdown/carrier';
import { renderMarkdownPreviewWithIncludes } from 'orz-markdown/carrier/editor';

/** What a render may use besides the text. */
export interface MdRenderContext {
  /** URL (or path) → text, or null: the host's include resolution (FC-19 `hooks.fetchInclude`). */
  fetchInclude?(target: string): Promise<string | null>;
  /**
   * `false` renders links as written (the host resolves them); default `true`
   * (twin links, the family names: `x.md` → `x.md.html`); a `TwinNaming`
   * (FC-18 §8.2, orz-markdown 2.5.0: the file's `#orz-shell` `"links"`, a
   * host's naming) names them so (`{ md: '{stem}.html' }`: `x.md` → `x.html`).
   */
  twinLinks?: boolean | TwinNaming;
  /** A cache for fetched includes (kept for the cache's life). */
  cache?: Map<string, unknown>;
  /** Resolved includes (the file's `#orz-includes`): target as written → text. */
  includes?: Readonly<Record<string, string>>;
}

/** Render an md text to the article's inner HTML. */
export function renderMd(text: string, ctx: MdRenderContext = {}): Promise<string> {
  return renderMarkdownPreviewWithIncludes(text, {
    ...(ctx.twinLinks === false ? { twinLinks: false } : ctx.twinLinks && typeof ctx.twinLinks === 'object' ? { twinLinks: ctx.twinLinks } : {}),
    ...(ctx.includes ? { includes: ctx.includes } : {}),
    ...(ctx.fetchInclude ? { fetchInclude: ctx.fetchInclude } : {}),
    ...(ctx.cache ? { cache: ctx.cache } : {}),
  });
}
