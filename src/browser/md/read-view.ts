/**
 * KIND-SPECIFIC (md): the read view of an assembled `.md.html` — the
 * document rendered IN THE PAGE (owner decision 3, REBUILD §3a) into the
 * shell's `#orz-doc` article, styled by the header's theme and measure, and
 * enhanced by the kit's `enhanceDocument` (orz-markdown `preview-frame`):
 * the orz browser runtime (QR overlay, copy-as-Markdown, tabs) and — only
 * when the document needs them — highlight.js, Mermaid, SMILES and Chart.js
 * from their pinned CDN URLs. The kit's app (`carrier/app`) drives it
 * through `CarrierReadView` (spec/carrier-app.md §3.3).
 */
import { readDocument } from 'orz-markdown/carrier';
import type { CarrierReadView, ReadViewContext } from 'orz-markdown/carrier/app';
import { enhanceDocument, PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { articleClass, presentationOf, themeHref } from '../../presentation.js';
import { renderMd } from './render.js';

/** The md read view: the kit's `CarrierReadView` with the article it renders into. */
export interface MdReadView extends CarrierReadView {
  /** `#orz-view`, the view's root (hidden while editing). */
  readonly element: HTMLElement;
  /** `#orz-doc`, the article. */
  readonly article: HTMLElement;
  render(text: string, ctx?: ReadViewContext): Promise<void>;
}

/** The read view of the shell's `#orz-view` / `#orz-doc` (created when the page lacks them). */
export function createReadView(doc: Document): MdReadView {
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

  const present = (text: string): { scheme: 'light' | 'dark' } => {
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
    return { scheme: p.theme.scheme };
  };

  return {
    element: main,
    article,
    present,
    async render(text, ctx = {}) {
      const mine = ++generation;
      const { scheme } = present(text);
      const html = await renderMd(text, ctx);
      if (mine !== generation) return; // a newer render won
      article!.innerHTML = html;
      try {
        const title = readDocument(text, { kind: 'md' }).title;
        if (doc.title !== title) doc.title = title;
      } catch { /* the title stays */ }
      // the libraries load in the background: the content shows now (offline it stays as rendered)
      void enhanceDocument(article!, { scheme }).catch(() => undefined);
    },
  };
}
