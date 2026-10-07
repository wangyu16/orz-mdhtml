/**
 * orz-mdhtml — programmatic library entry.
 *
 * Generates a self-contained, editable `.md.html` document in-process, without
 * shelling out to the CLI. The library always produces a fully-inline document
 * (inlined renderer bundle + embedded source) — the same output as the CLI's
 * `--inline` delivery.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
import { PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';
import { buildHtml, type ThemeEntry } from './template.js';
import { extractDocMeta, mergeDocMeta, renderDocMetaHead, renderDocMetaIsland, type DocMeta } from 'orz-markdown/doc-meta';
import { THEMES, DEFAULT_THEME } from './themes.js';
import { VERSION } from './version.js';

// The 1.0 format-1 API (isomorphic; FC-18). The 0.9 composition below is the
// old runtime path, replaced in rebuild steps 3–5.
export { assemble, extract, readDocument, newDocument, cdnBundleUrl, BUNDLE_FILE, type AssembleOptions, type NewDocumentOptions } from './assemble.js';
export { inspect, type InspectReport } from './inspect.js';
export { upgrade, readLegacy, type LegacyFile, type UpgradeResult } from './legacy.js';
export { THEMES, DEFAULT_THEME, isThemeId, type ThemeInfo } from './themes.js';
export { VERSION } from './version.js';

const CDN = {
  cm: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16',
};

const HERE = dirname(fileURLToPath(import.meta.url));

/** The orz-markdown version (for theme CDN URLs). */
export function orzVersionOf(): string {
  return ORZ_MARKDOWN_VERSION;
}

/** orz-mdhtml's own version — pins the renderer bundle + version check. */
export function selfVersionOf(): string {
  return VERSION;
}

// assets/ sits next to dist/ when published, and next to src/ in dev.
export function findAsset(name: string): string {
  for (const p of [join(HERE, '..', 'assets', name), join(HERE, '..', '..', 'assets', name)]) {
    if (existsSync(p)) return p;
  }
  throw new Error(`asset not found: ${name}`);
}

/** Locate the inlined browser renderer bundle (published sibling; dev ../dist). */
export function findRendererBundle(): string {
  // dist/lib.js (published) → sibling; src/lib.ts (dev) → ../dist.
  const bundlePath = [
    join(HERE, 'orzmd.browser.js'),
    join(HERE, '..', 'dist', 'orzmd.browser.js'),
  ].find(existsSync);
  if (!bundlePath) {
    throw new Error('Inline mode needs the browser bundle. Run: npm run bundle');
  }
  return bundlePath;
}

/** Inputs to the single shared composition path. */
export interface ComposeOptions {
  /** Raw markdown source. */
  source: string;
  /** Document <title>. */
  title: string;
  /** Base filename (no extension) used as the save suggestion. */
  filename: string;
  /** Stable per-document id — passed in so callers control determinism. */
  docId: string;
  /** orz-markdown theme id (falls back to DEFAULT_THEME when unknown). */
  theme: string;
  /** Renderer delivery: `inline` embeds the bundle (default, larger, offline);
   *  `cdn` references it from jsDelivr (small file — the framework loads at
   *  view time, and viewers get the published bundle without re-embedding it). */
  delivery?: 'inline' | 'cdn';
  /** Document metadata injected by the host; wins over an in-source meta block. */
  metadata?: DocMeta;
}

/**
 * The one composition path for a fully-inline `.md.html` document. Both the
 * library entry (`buildMdHtml`) and the CLI's `--inline` delivery call this,
 * so given the same `docId` + `source` + `title` + `theme` the output is
 * byte-identical.
 */
export function composeInlineMdHtml(opts: ComposeOptions): string {
  const orzVersion = orzVersionOf();
  const selfVersion = selfVersionOf();

  // Read + strip any `{{nyml kind: meta}}` block; host metadata wins field by
  // field. The stripped body is what the in-file editor embeds and renders.
  const extracted = extractDocMeta(opts.source);
  const meta = mergeDocMeta(extracted.meta, opts.metadata);
  const source = extracted.body;

  const appJs = readFileSync(findAsset('app.js'), 'utf8');

  const themeBase = `https://cdn.jsdelivr.net/npm/orz-markdown@${orzVersion}/themes`;
  const themes: ThemeEntry[] = THEMES.map((t) => ({ ...t, href: `${themeBase}/${t.id}.css` }));
  const defaultTheme = themes.some((t) => t.id === opts.theme) ? opts.theme : themes[0].id;

  const renderer: Parameters<typeof buildHtml>[0]['renderer'] =
    opts.delivery === 'cdn'
      ? {
          mode: 'cdn',
          src: `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@${selfVersion}/orzmd.browser.js`,
        }
      : {
          mode: 'inline',
          js: readFileSync(findRendererBundle(), 'utf8'),
        };

  return buildHtml({
    source,
    metaHead: renderDocMetaHead(meta),
    metaIsland: renderDocMetaIsland(meta),
    title: opts.title,
    filename: opts.filename,
    docId: opts.docId,
    rendererVersion: selfVersion,
    appJs,
    runtimeScript: getBrowserRuntimeScript(),
    renderer,
    versionManifest:
      'https://data.jsdelivr.com/v1/packages/npm/orz-mdhtml-browser/resolved',
    defaultTheme,
    themes,
    frame: {
      katexCss: PREVIEW_CDN.katexCss,
      hljsLightCss: PREVIEW_CDN.hljsLightCss,
      hljsDarkCss: PREVIEW_CDN.hljsDarkCss,
      hljsJs: PREVIEW_CDN.hljsJs,
      mermaidJs: PREVIEW_CDN.mermaidJs,
      smilesJs: PREVIEW_CDN.smilesJs,
      chartJs: PREVIEW_CDN.chartJs,
    },
    editorLibs: {
      codemirrorCss: `${CDN.cm}/codemirror.min.css`,
      codemirrorLightThemeCss: `${CDN.cm}/theme/eclipse.min.css`,
      codemirrorDarkThemeCss: `${CDN.cm}/theme/material-darker.min.css`,
      codemirrorJs: `${CDN.cm}/codemirror.min.js`,
      codemirrorMarkdownJs: `${CDN.cm}/mode/markdown/markdown.min.js`,
      codemirrorContinuelistJs: `${CDN.cm}/addon/edit/continuelist.min.js`,
      morphdomJs: 'https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js',
    },
  });
}

/**
 * Build a self-contained, fully-inline `.md.html` document from a markdown
 * string, in-process. Returns the complete document as a string.
 *
 * Output is byte-identical to the CLI's `--inline` delivery for the same
 * markdown / title / theme; the only source of nondeterminism is `docId`
 * (a fresh `randomUUID()` per call, which keys the per-document IndexedDB
 * save handle).
 */
export function buildMdHtml(opts: {
  markdown: string;
  title?: string;
  theme?: string;
  /** `inline` (default) embeds the framework; `cdn` references it from jsDelivr
   *  (small file — requires orz-mdhtml-browser to be published at this version). */
  delivery?: 'inline' | 'cdn';
  /** Document metadata (license, author, source …) injected by the host. */
  metadata?: DocMeta;
}): string {
  const title = opts.title ?? 'Untitled';
  return composeInlineMdHtml({
    source: opts.markdown,
    title,
    filename: 'Untitled',
    docId: randomUUID(),
    theme: opts.theme ?? DEFAULT_THEME,
    delivery: opts.delivery,
    metadata: opts.metadata,
  });
}
