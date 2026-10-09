/**
 * KIND-SPECIFIC (md): the read view of an assembled `.md.html` — the
 * document rendered IN THE PAGE (owner decision 3, REBUILD §3a) into the
 * shell's `#orz-doc` article, styled by the header's theme and measure, and
 * enhanced by the kit's `enhanceDocument` (orz-markdown `preview-frame`):
 * the orz browser runtime (QR overlay, copy-as-Markdown, tabs) and — only
 * when the document needs them — highlight.js, Mermaid, SMILES and Chart.js
 * from their pinned CDN URLs. The kit's app (`carrier/app`) drives it
 * through `CarrierReadView` (spec/carrier-app.md §3.3); the reader's text
 * size (`--orz-font-scale`, §4.10) zooms the article.
 */
import { readDocument } from 'orz-markdown/carrier';
import type { CarrierReadView, ReadViewContext } from 'orz-markdown/carrier/app';
import { disposeEnhancement, enhanceDocument, PREVIEW_CDN, swapStylesheet } from 'orz-markdown/preview-frame';
import { articleClass, presentationOf, themeHref, SHELL_STYLESHEETS } from '../../presentation.js';
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
  // the reader's text size (the kit's reader control, a preference by uid — never the document): the kit sets
  // `--orz-font-scale` on the view; the article zooms by it — every theme sizes text its own way (px, rem, em,
  // clamp with vw), so one zoom scales all of them evenly and keeps the line length in characters. Set at run
  // time (CSSOM), so the assembled file's bytes do not change; the editor's preview does not follow it.
  article.style.setProperty('zoom', 'var(--orz-font-scale, 1)');
  let generation = 0;
  let destroyed = false;

  /** The shell writes its stylesheets switched off (`media="not all"`, so a slow CDN never blocks the page): switch them on. */
  const enableStylesheets = (): void => {
    for (const id of SHELL_STYLESHEETS) {
      const l = doc.getElementById(id);
      if (l && l.getAttribute('media') === 'not all') l.removeAttribute('media');
    }
  };

  const setTitle = (text: string): void => {
    try {
      const title = readDocument(text, { kind: 'md' }).title;
      if (doc.title !== title) doc.title = title;
    } catch { /* the title stays */ }
  };

  const present = (text: string): { scheme: 'light' | 'dark' } => {
    const p = presentationOf(text);
    // the kit's swap (M.27): the old sheet styles the page until the new one has loaded — no flash
    swapStylesheet(doc, 'orz-theme', themeHref(p.theme.id));
    swapStylesheet(doc, 'orz-hljs', p.theme.scheme === 'dark' ? PREVIEW_CDN.hljsDarkCss : PREVIEW_CDN.hljsLightCss);
    enableStylesheets();
    const scheme = doc.querySelector('meta[name="color-scheme"]');
    if (scheme && scheme.getAttribute('content') !== p.theme.scheme) scheme.setAttribute('content', p.theme.scheme);
    main!.setAttribute('data-orz-theme', p.theme.id);
    const cls = articleClass(p.measure);
    if (article!.className !== cls) article!.className = cls;
    setTitle(text); // the page title follows the header's title (and the first heading)
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
      if (mine !== generation || destroyed) return; // a newer render won (or the view is gone)
      disposeEnhancement(article!); // the old content's charts and QR overlay go with it (M.26)
      article!.innerHTML = html;
      // the libraries load in the background: the content shows now (offline it stays as rendered)
      void enhanceDocument(article!, { scheme }).catch(() => undefined);
    },
    destroy() {
      destroyed = true;
      generation++;
      disposeEnhancement(article!);
    },
  };
}
