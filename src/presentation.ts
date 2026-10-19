/**
 * The `md` kind's presentation: how the header's `theme` and `measure`
 * (FC-18 §5.1 — document data, owner decision 4 of REBUILD §3a) become the
 * stylesheets and the article class of the 1.0 shell, the read view and the
 * editor preview. One place, so the assembled file (Node and browser), the
 * page's read view and the preview frame name the same stylesheets.
 *
 * Only the header decides (never anything but the text): an absent or unknown
 * theme is the default theme, an absent or unknown measure is `normal`.
 * Isomorphic: no Node built-ins, no clock, no environment.
 */
import { readHeader } from 'orz-markdown/carrier';
import { PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { ORZ_MARKDOWN_VERSION } from './version.js';
import { themeOf, type ThemeInfo } from './themes.js';

/** The `measure` values of FC-18 §5.1 (orz-markdown's `measure-*` article classes). */
export const MEASURES = Object.freeze(['normal', 'wide', 'full'] as const);
export type Measure = (typeof MEASURES)[number];
export const DEFAULT_MEASURE: Measure = 'normal';

/** Labels a measure picker shows. */
export const MEASURE_LABELS: Readonly<Record<Measure, string>> = Object.freeze({ normal: 'Normal', wide: 'Wide', full: 'Full width' });

export function isMeasure(v: unknown): v is Measure {
  return typeof v === 'string' && (MEASURES as readonly string[]).includes(v);
}

/** What the header asks for, resolved: the theme (default when absent or unknown) and the measure. */
export interface Presentation {
  theme: ThemeInfo;
  measure: Measure;
}

/** The presentation of a text, from its header only (O(header): the body is not parsed). */
export function presentationOf(text: string): Presentation {
  const fields = readHeader(text)?.fields ?? {};
  const measure = fields['measure']?.trim();
  return { theme: themeOf(fields['theme']?.trim()), measure: isMeasure(measure) ? measure : DEFAULT_MEASURE };
}

/**
 * The pinned jsDelivr URL of an orz-markdown theme stylesheet (it imports
 * `common.css` itself), at the kit version this release bundles (src/version.ts,
 * fixed at build time), so Node and the browser engine write the same URL.
 */
export function themeHref(id: string): string {
  return `https://cdn.jsdelivr.net/npm/orz-markdown@${ORZ_MARKDOWN_VERSION}/themes/${themeOf(id).id}.css`;
}

/** The article's class for a measure (orz-markdown `themes/common.css`). */
export function articleClass(measure: Measure): string {
  return measure === 'normal' ? 'markdown-body' : `markdown-body measure-${measure}`;
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The shell's `<head>` part for a presentation: viewport, colour scheme, the
 * theme stylesheet (`#orz-theme`), KaTeX's stylesheet and the highlight.js
 * stylesheet of the theme's scheme (`#orz-hljs`) — the pinned URLs of
 * orz-markdown's preview frame. The page's engine swaps `#orz-theme` and
 * `#orz-hljs` when the reader picks another theme.
 *
 * `deferred` (the assembled file): the three stylesheets are written with
 * `media="not all"` — fetched, but blocking neither the first paint nor the
 * inline engine (a slow or unreachable CDN would otherwise hold the whole page
 * blank) — and the read view switches them on (`enableStylesheets`) when it
 * presents the document. No inline handler (`onload`) is needed.
 */
export function shellHead(p: Presentation, o: { deferred?: boolean } = {}): string {
  const hljs = p.theme.scheme === 'dark' ? PREVIEW_CDN.hljsDarkCss : PREVIEW_CDN.hljsLightCss;
  const media = o.deferred ? ' media="not all"' : '';
  return [
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="color-scheme" content="${p.theme.scheme}">`,
    `<link rel="stylesheet" id="orz-theme" href="${attr(themeHref(p.theme.id))}"${media}>`,
    `<link rel="stylesheet" id="orz-katex" href="${attr(PREVIEW_CDN.katexCss)}"${media}>`,
    `<link rel="stylesheet" id="orz-hljs" href="${attr(hljs)}"${media}>`,
  ].join('\n');
}

/** The ids of the shell's stylesheets (`shellHead`), in order. */
export const SHELL_STYLESHEETS = Object.freeze(['orz-theme', 'orz-katex', 'orz-hljs'] as const);

/**
 * What `#orz-doc` holds until the engine renders the document: one constant,
 * quiet line for a reader whose browser cannot run the engine (the read view
 * replaces it). The same for every document of a delivery (A.4): an inline
 * file carries its engine; a cdn file loads it from the web, so its line
 * names the connection first ({@link FALLBACK_LINE_CDN}).
 */
export const FALLBACK_LINE = 'If this page stays blank, open it in a recent browser; the document\'s text is inside this file \u2014 see the comment at the top.';

/** The fallback line of a cdn file (its engine comes from jsDelivr). */
export const FALLBACK_LINE_CDN = 'If this page stays blank, check your connection (this page loads its engine from the web) or open it in a recent browser; the document\'s text is inside this file \u2014 see the comment at the top.';

/**
 * The read view's markup: the page renders the document into `#orz-doc`
 * (in the page, not an iframe — owner decision 3) with the measure's class;
 * until then the article holds the fallback line of the delivery.
 */
export function readViewMarkup(p: Presentation, delivery: 'inline' | 'cdn' = 'inline'): string {
  const line = delivery === 'cdn' ? FALLBACK_LINE_CDN : FALLBACK_LINE;
  return `<main id="orz-view" class="orz-view" data-orz-theme="${attr(p.theme.id)}"><article id="orz-doc" class="${articleClass(p.measure)}"><p class="orz-fallback" style="opacity:.6;font:14px/1.5 system-ui,sans-serif">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p></article></main>`;
}

/**
 * The editor preview frame's presentation (FC-19 §8.4 `preview.head`,
 * `scheme`, `articleClass`; the kit's `followPresentation` rebuilds the frame
 * when it changes): the theme stylesheet in the head, the theme's colour
 * scheme, and the measure's article class.
 */
export function previewPresentation(p: Presentation): { head: string; scheme: 'light' | 'dark'; articleClass: string } {
  return { head: `<link rel="stylesheet" href="${attr(themeHref(p.theme.id))}">`, scheme: p.theme.scheme, articleClass: articleClass(p.measure) };
}
