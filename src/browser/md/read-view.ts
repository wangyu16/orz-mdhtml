/**
 * KIND-SPECIFIC (md): the read view of an assembled `.md.html` — the
 * document rendered IN THE PAGE (owner decision 3, REBUILD §3a) into the
 * shell's `#orz-doc` article, styled by the header's theme and measure, and
 * enhanced like orz-markdown's preview frame: the orz browser runtime (QR
 * overlay, copy-as-Markdown, tabs) at once, and — only when the document
 * needs them — highlight.js, Mermaid, SMILES and Chart.js from their pinned
 * CDN URLs (`PREVIEW_CDN`), then `__orzEnhance()`.
 *
 * KIT GAP (reported): orz-markdown 2.1.0 ships the enhancement as markup for
 * an iframe (`getPreviewFrameAssets().bodyScripts()`), with no entry point
 * for a page that renders the document itself. This module runs the kit's
 * own inline scripts from that markup (the runtime, `__orzEnhance`, Mermaid's
 * setup) instead of copying them, and loads each library only when the
 * rendered document has something for it.
 */
import { getPreviewFrameAssets, PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { readDocument } from 'orz-markdown/carrier';
import { articleClass, presentationOf, themeHref, type Presentation } from '../../presentation.js';
import { renderMd, type MdRenderContext } from './render.js';

type Win = Window & { __orzEnhance?: () => void; __orzSmilesTheme?: string; mermaid?: unknown };

/** The libraries the read view may load, each with the selector of the content that needs it. */
const LIBS: ReadonlyArray<{ url: string; needs: string }> = [
  { url: PREVIEW_CDN.hljsJs, needs: 'pre code' },
  { url: PREVIEW_CDN.mermaidJs, needs: '.mermaid' },
  { url: PREVIEW_CDN.smilesJs, needs: 'canvas[data-smiles]' },
  { url: PREVIEW_CDN.chartJs, needs: 'canvas.orz-chart' },
];

interface KitScripts {
  /** Inline scripts to run at once (the runtime, `__orzEnhance`). */
  now: string[];
  /** Inline scripts that set up a library, by the library's URL (Mermaid's `initialize`). */
  after: Map<string, string[]>;
}

let kitScripts: KitScripts | null = null;

/** The kit's inline enhancement scripts, read from its preview-frame markup (see the module comment). */
function readKitScripts(doc: Document): KitScripts {
  if (kitScripts) return kitScripts;
  const parsed = new (doc.defaultView as Window & typeof globalThis).DOMParser().parseFromString(`<!doctype html><body>${getPreviewFrameAssets().bodyScripts()}`, 'text/html');
  const now: string[] = [];
  const after = new Map<string, string[]>();
  for (const s of Array.from(parsed.querySelectorAll('script'))) {
    if (s.src) continue;
    const code = s.textContent ?? '';
    // Mermaid's setup belongs after Mermaid; everything else (runtime, __orzEnhance) runs now.
    if (/\bmermaid\./.test(code) && !/__orzEnhance\s*=/.test(code)) after.set(PREVIEW_CDN.mermaidJs, [...(after.get(PREVIEW_CDN.mermaidJs) ?? []), code]);
    else now.push(code);
  }
  kitScripts = { now, after };
  return kitScripts;
}

function runInline(doc: Document, code: string): void {
  const s = doc.createElement('script');
  s.textContent = code;
  (doc.head ?? doc.documentElement).appendChild(s);
}

/** The read view of one page. */
export interface ReadView {
  /** Render `text` into the article (theme, measure, title follow its header). Resolves when the content is in the page. */
  render(text: string, ctx?: MdRenderContext): Promise<void>;
  /** Apply a text's presentation (theme stylesheets, measure, colour scheme) without re-rendering. */
  present(text: string): Presentation;
  /** The article element. */
  readonly article: HTMLElement;
}

/** The read view of the shell's `#orz-view` / `#orz-doc` (created when the page lacks them). */
export function createReadView(doc: Document): ReadView {
  const win = doc.defaultView as Win;
  let main = doc.getElementById('orz-view');
  if (!main) {
    main = doc.createElement('main');
    main.id = 'orz-view';
    main.className = 'orz-view';
    doc.body.prepend(main);
  }
  let article = doc.getElementById('orz-doc');
  if (!article) {
    article = doc.createElement('article');
    article.id = 'orz-doc';
    main.append(article);
  }
  const loading = new Map<string, Promise<void>>();
  let started = false;
  let generation = 0;

  const link = (id: string): HTMLLinkElement => {
    let l = doc.getElementById(id) as HTMLLinkElement | null;
    if (!l) {
      l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.id = id;
      doc.head.append(l);
    }
    return l;
  };

  const enhance = (): void => {
    try { win.__orzEnhance?.(); } catch { /* a library's error stays its own */ }
  };

  const load = (url: string): Promise<void> => {
    let p = loading.get(url);
    if (!p) {
      p = new Promise<void>((resolve) => {
        const s = doc.createElement('script');
        s.src = url;
        s.async = true;
        s.addEventListener('load', () => {
          for (const code of readKitScripts(doc).after.get(url) ?? []) runInline(doc, code);
          resolve();
          enhance();
        });
        s.addEventListener('error', () => resolve()); // offline: the content shows unenhanced
        doc.head.append(s);
      });
      loading.set(url, p);
    }
    return p;
  };

  const present = (text: string): Presentation => {
    const p = presentationOf(text);
    const theme = link('orz-theme');
    const href = themeHref(p.theme.id);
    if (theme.getAttribute('href') !== href) theme.setAttribute('href', href);
    const hljs = link('orz-hljs');
    const hljsHref = p.theme.scheme === 'dark' ? PREVIEW_CDN.hljsDarkCss : PREVIEW_CDN.hljsLightCss;
    if (hljs.getAttribute('href') !== hljsHref) hljs.setAttribute('href', hljsHref);
    const scheme = doc.querySelector('meta[name="color-scheme"]');
    if (scheme && scheme.getAttribute('content') !== p.theme.scheme) scheme.setAttribute('content', p.theme.scheme);
    main!.setAttribute('data-orz-theme', p.theme.id);
    const cls = articleClass(p.measure);
    if (article!.className !== cls) article!.className = cls;
    win.__orzSmilesTheme = p.theme.scheme;
    return p;
  };

  return {
    article,
    present,
    async render(text, ctx = {}) {
      const mine = ++generation;
      present(text);
      const html = await renderMd(text, ctx);
      if (mine !== generation) return; // a newer render won
      article!.innerHTML = html;
      try {
        const title = readDocument(text, { kind: 'md' }).title;
        if (doc.title !== title) doc.title = title;
      } catch { /* the title stays */ }
      if (!started) {
        started = true;
        for (const code of readKitScripts(doc).now) runInline(doc, code);
      }
      enhance();
      for (const lib of LIBS) if (article!.querySelector(lib.needs)) void load(lib.url);
    },
  };
}
