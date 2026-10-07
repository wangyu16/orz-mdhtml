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
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';
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

/** The pinned jsDelivr URL of an orz-markdown theme stylesheet (it imports `common.css` itself). */
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
 */
export function shellHead(p: Presentation): string {
  const hljs = p.theme.scheme === 'dark' ? PREVIEW_CDN.hljsDarkCss : PREVIEW_CDN.hljsLightCss;
  return [
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="color-scheme" content="${p.theme.scheme}">`,
    `<link rel="stylesheet" id="orz-theme" href="${attr(themeHref(p.theme.id))}">`,
    `<link rel="stylesheet" id="orz-katex" href="${attr(PREVIEW_CDN.katexCss)}">`,
    `<link rel="stylesheet" id="orz-hljs" href="${attr(hljs)}">`,
  ].join('\n');
}

/**
 * The read view's markup: the page renders the document into `#orz-doc`
 * (in the page, not an iframe — owner decision 3) with the measure's class.
 */
export function readViewMarkup(p: Presentation): string {
  return `<main id="orz-view" class="orz-view" data-orz-theme="${attr(p.theme.id)}"><article id="orz-doc" class="${articleClass(p.measure)}"></article></main>`;
}

/**
 * The editor preview frame's extra `<head>` (FC-19 §8.4 `preview.head`): the
 * theme stylesheet and, for a non-normal measure, the theme token that sets the
 * article's measure (the frame's article class is fixed when the frame is
 * built, so the measure travels in the head, which `preview.setOptions` can
 * rebuild — a kit gap, reported with rebuild step 3).
 */
export function previewHead(p: Presentation): string {
  const link = `<link rel="stylesheet" href="${attr(themeHref(p.theme.id))}">`;
  if (p.measure === 'normal') return link;
  const width = p.measure === 'full' ? 'none' : 'var(--orz-measure-wide, min(100%, 64rem))';
  return `${link}<style>html:root{--markdown-body-max-width:${width}}</style>`;
}
