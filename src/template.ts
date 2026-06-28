/**
 * Builds the self-contained .md.html shell.
 *
 * The file is a *document first*: by default it shows the rendered Markdown in
 * an <iframe> (full theme isolation, true WYSIWYG) with a single small edit
 * affordance. Clicking it reveals a minimal editor (CodeMirror) beside a live,
 * incrementally-updated preview. The Markdown source is the single source of
 * truth, embedded in a <script type="text/markdown">; Save re-serializes the
 * outer document. Editor libraries are lazy-loaded on first edit so reading
 * stays lightweight.
 */

export interface ThemeEntry {
  id: string;
  name: string;
  scheme: 'light' | 'dark';
  href: string;
}

export interface TemplateOptions {
  /** Raw markdown source. */
  source: string;
  /** Document <title>. */
  title: string;
  /** Base filename (no extension) used as the save suggestion. */
  filename: string;
  /** Stable per-document id — keys the persisted save handle in IndexedDB. */
  docId: string;
  /** orz-markdown version (version-check baseline). */
  rendererVersion: string;
  /** The in-file app runtime (assets/app.js contents). */
  appJs: string;
  /** orz-markdown browser runtime (QR + copy-as-markdown), injected into the iframe. */
  runtimeScript: string;
  /** Renderer delivery: inline bundle JS, or a CDN <script src>. */
  renderer: { mode: 'inline'; js: string } | { mode: 'cdn'; src: string };
  /** jsDelivr resolved-version manifest URL (version check). Empty to disable. */
  versionManifest: string;
  /** Theme id selected by default. */
  defaultTheme: string;
  /** All selectable themes (CDN hrefs). */
  themes: ThemeEntry[];
  /** Assets injected into the preview iframe. */
  frame: {
    katexCss: string;
    hljsLightCss: string;
    hljsDarkCss: string;
    hljsJs: string;
    mermaidJs: string;
    smilesJs: string;
  };
  /** CDN URLs for lazy-loaded editor libraries. */
  editorLibs: {
    codemirrorCss: string;
    codemirrorLightThemeCss: string;
    codemirrorDarkThemeCss: string;
    codemirrorJs: string;
    codemirrorMarkdownJs: string;
    codemirrorContinuelistJs: string;
    splitJs: string;
    morphdomJs: string;
  };
}

/** Guard inline <script> content against premature `</script>` termination. */
function escapeForScript(s: string): string {
  return s.replace(/<\/(script)/gi, '<\\/$1');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The orz mark — the "orz" wordmark knocked out of a weathered green seal
 *  (rough-edged, stone-textured). From wangyu16/logoes-and-icons (orz.svg);
 *  IDs are namespaced `orzlogo-*` so they can't collide with user SVGs. */
const ORZ_LOGO =
  "<svg viewBox=\"-5 -5 180 100\" xmlns=\"http://www.w3.org/2000/svg\" class=\"orz-mark\" aria-hidden=\"true\"><defs><filter id=\"orzlogo-rough\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.04\" numOctaves=\"3\" result=\"noise\" /><feDisplacementMap in=\"SourceGraphic\" in2=\"noise\" scale=\"2.5\" xChannelSelector=\"R\" yChannelSelector=\"G\" /></filter><path d=\"M 20,23 C 33,16 57,17 84,13 C 111,8 137,4 153,6 C 165,7 170,13 169,25 L 167,66 C 166,79 159,87 146,89 C 121,93 92,92 60,91 C 41,90 27,92 16,89 C 6,86 1,79 1,67 L 1,50 C 1,35 7,25 20,23 Z\" id=\"orzlogo-seal\" /><filter id=\"orzlogo-stone\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.95\" numOctaves=\"2\" seed=\"11\" result=\"noise\" /><feColorMatrix in=\"noise\" type=\"saturate\" values=\"0\" result=\"mono\" /><feComponentTransfer in=\"mono\" result=\"grain\"><feFuncA type=\"table\" tableValues=\"0 0.16\" /></feComponentTransfer></filter><mask id=\"orzlogo-mask\"><use href=\"#orzlogo-seal\" fill=\"white\" /><path d=\"M37.81 80.31Q30.44 80.31 24.50 77Q18.56 73.69 15.25 67.75Q11.94 61.81 11.94 54.19L11.94 54.19Q11.94 41.69 21.13 35.56Q30.31 29.44 43.69 29.44L43.69 29.44Q49.81 29.44 55.13 32.44Q60.44 35.44 63.69 41.06Q66.94 46.69 66.94 54.06L66.94 54.06Q66.94 62.06 62.81 68Q58.69 73.94 52 77.13Q45.31 80.31 37.81 80.31L37.81 80.31ZM36.44 73.19Q48.06 73.19 54.06 67.94Q60.06 62.69 60.06 52.56L60.06 52.56Q60.06 45.69 55.38 40.69Q50.69 35.69 42.31 35.69L42.31 35.69Q36.69 35.69 30.94 37.81Q25.19 39.94 21.44 44.19Q17.69 48.44 17.69 54.44L17.69 54.44Q17.69 59.44 20.19 63.75Q22.69 68.06 27 70.63Q31.31 73.19 36.44 73.19L36.44 73.19ZM87.94 80.19Q82.81 70.19 79.88 56.69Q76.94 43.19 76.94 33.31L76.94 33.31Q76.94 29.44 78.69 28.31L78.69 28.31Q79.69 27.69 80.19 27.69L80.19 27.69Q81.06 27.69 81.50 29.06Q81.94 30.44 82.44 34.06L82.44 34.06L83.06 38.56Q84.44 31.81 88.38 27.88Q92.31 23.94 98.06 23.94L98.06 23.94Q104.44 23.94 107.56 26.38Q110.69 28.81 110.69 34.44L110.69 34.44Q104.44 31.44 99.31 31.44L99.31 31.44Q94.44 31.44 90.94 34.06Q87.44 36.69 86.06 41.81L86.06 41.81Q84.94 45.31 84.94 48.44L84.94 48.44Q84.94 51.81 85.88 54.75Q86.81 57.69 88.81 61.94L88.81 61.94Q90.69 66.31 91.75 69.44Q92.81 72.56 92.94 76.19L92.94 76.19Q92.94 78.31 91.44 79.25Q89.94 80.19 87.94 80.19L87.94 80.19ZM160.56 66.19Q163.06 68.06 163.06 70.19L163.06 70.19Q163.06 73.56 157.31 75.81Q151.56 78.06 144.31 79.13Q137.06 80.19 132.81 80.19L132.81 80.19Q128.06 80.19 123.75 78.63Q119.44 77.06 119.44 73.19L119.44 73.19Q119.44 69.44 123.63 63.44Q127.81 57.44 133.69 51.19L133.69 51.19L117.56 51.19Q116.31 51.19 116.31 48.94L116.31 48.94Q116.31 47.19 116.69 46.50Q117.06 45.81 117.69 45.69Q118.31 45.56 120.06 45.56L120.06 45.56L139.31 45.56Q143.94 39.69 146.38 35.50Q148.81 31.31 148.81 27.69L148.81 27.69Q148.81 24.06 146.31 21.19L146.31 21.19Q142.44 20.44 138.81 20.44L138.81 20.44Q131.94 20.44 127.19 22.75Q122.44 25.06 121.94 28.81L121.94 28.81Q119.06 28.81 118.13 27.81Q117.19 26.81 117.19 24.44L117.19 24.44Q117.19 21.94 119.75 19.63Q122.31 17.31 126.94 15.88Q131.56 14.44 137.31 14.44L137.31 14.44Q142.06 14.44 147.31 15.56L147.31 15.56Q150.56 16.19 152.81 19.69Q155.06 23.19 155.06 27.44L155.06 27.44Q155.06 31.19 152.75 35.31Q150.44 39.44 145.94 45.56L145.94 45.56L152.06 45.56Q156.81 45.56 158.38 46.06Q159.94 46.56 159.94 48.06L159.94 48.06Q159.94 49.31 159.13 50.19Q158.31 51.06 157.44 51.06L157.44 51.06L140.19 51.06Q134.06 57.94 130.81 63.25Q127.56 68.56 128.19 70.81L128.19 70.81Q128.69 73.19 135.94 74.06L135.94 74.06Q144.06 74.06 149.69 72.13Q155.31 70.19 160.56 66.19L160.56 66.19Z\" fill=\"black\" stroke=\"black\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\" /></mask></defs><g filter=\"url(#orzlogo-rough)\"><use href=\"#orzlogo-seal\" fill=\"#96d969\" mask=\"url(#orzlogo-mask)\" /><use href=\"#orzlogo-seal\" fill=\"#6ea84d\" opacity=\"0.28\" filter=\"url(#orzlogo-stone)\" mask=\"url(#orzlogo-mask)\" /><use href=\"#orzlogo-seal\" fill=\"none\" stroke=\"#c8f7a5\" stroke-width=\"1.5\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-opacity=\"0.42\" mask=\"url(#orzlogo-mask)\" /><use href=\"#orzlogo-seal\" fill=\"none\" stroke=\"#5f8f44\" stroke-width=\"1.2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-opacity=\"0.35\" mask=\"url(#orzlogo-mask)\" /></g></svg>";

/** GitHub mark (fill = currentColor). */
const GH_ICON =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

/* Canonical icon set — shared thin-stroke line icons (from the orz-markdown
 * editor) so the same function shows the same glyph across every orz surface. */
function ic(path: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
const ICON = {
  save: ic('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  download: ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  sync: ic('<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M8 12h8"/>'),
  pencil: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
  collapse: ic('<path d="M15 6l-6 6 6 6"/>'),
};

/** Editor-header brand: logo + app name + GitHub link (whole thing → repo). */
const BRAND =
  '<a id="orz-brand" href="https://github.com/wangyu16/orz-mdhtml" target="_blank" rel="noopener noreferrer" title="orz-mdhtml on GitHub">' +
  `<span class="orz-logo">${ORZ_LOGO}</span>` +
  '<span class="orz-brand-name">mdhtml</span>' +
  `<span class="orz-gh">${GH_ICON}</span>` +
  '</a>';

export function buildHtml(opts: TemplateOptions): string {
  const rendererTag =
    opts.renderer.mode === 'inline'
      ? `<script data-orz-asset="engine">${escapeForScript(opts.renderer.js)}</script>`
      : `<script data-orz-asset="engine" src="${opts.renderer.src}"></script>`;

  const defaultScheme =
    opts.themes.find((t) => t.id === opts.defaultTheme)?.scheme ?? 'light';

  // Everything the app needs to (re)build the iframe + manage themes.
  const config = {
    filename: opts.filename,
    docId: opts.docId,
    rendererVersion: opts.rendererVersion,
    // NB: the update SOURCE (manifest/packages/host) is hardcoded in app.js, not
    // here — a config field must never be able to redirect the self-update.
    defaultTheme: opts.defaultTheme,
    themes: opts.themes,
    frame: opts.frame,
    editorLibs: opts.editorLibs,
    runtime: opts.runtimeScript,
  };

  const themeOptions = opts.themes
    .map(
      (t) =>
        `<option value="${t.id}"${t.id === opts.defaultTheme ? ' selected' : ''}>${escapeHtml(
          t.name,
        )}</option>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en" data-chrome="${defaultScheme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="generator" content="orz-mdhtml">
<style>
  :root {
    --orz-split: 44%;
  }
  [data-chrome="light"] {
    --c-bg: #ffffff; --c-fg: #1f2328; --c-muted: #6b7280;
    --c-border: #e6e8eb; --c-hover: #f2f4f6; --c-active: #e8eef7;
    --c-accent: #2f6feb; --c-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10);
    --c-fab-bg: rgba(255,255,255,.92); --c-fab-fg: #374151;
  }
  [data-chrome="dark"] {
    --c-bg: #1b1d21; --c-fg: #e6e8eb; --c-muted: #9aa1ab;
    --c-border: #2c3036; --c-hover: #24272c; --c-active: #2b3340;
    --c-accent: #5b8cff; --c-shadow: 0 1px 2px rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.35);
    --c-fab-bg: rgba(33,36,41,.92); --c-fab-fg: #cbd2da;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--c-bg); color: var(--c-fg);
    height: 100vh; overflow: hidden;
    display: flex; flex-direction: column;
  }

  /* ---- editor panel: dark chrome, slides in from the left ---- */
  #orz-panel {
    position: fixed; left: 0; top: 0; bottom: 0; width: var(--orz-split); z-index: 40;
    display: flex; flex-direction: column;
    background: #1f2228; border-right: 1px solid #333; box-shadow: 2px 0 16px rgba(0,0,0,.25);
    transform: translateX(calc(-100% - 24px)); transition: transform .22s ease;
    -webkit-user-select: none; user-select: none;
  }
  [data-mode="edit"] #orz-panel { transform: translateX(0); }
  #orz-toolbar {
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
    padding: 7px 10px; background: #23262c; border-bottom: 1px solid #34383f;
  }
  #orz-toolbar .ic {
    width: 32px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
    background: transparent; border: 0; border-radius: 7px; color: #c2c8d0; cursor: pointer;
    transition: background .12s, color .12s;
  }
  #orz-toolbar .ic:hover { background: #383d45; color: #fff; }
  #orz-toolbar .ic svg { width: 17px; height: 17px; display: block; }
  #orz-toolbar .ic[aria-pressed="true"] { color: #3b82f6; }
  #orz-toolbar .ic[aria-pressed="false"] { opacity: .5; }
  #orz-toolbar .ic.primary { background: #3b82f6; color: #fff; }
  #orz-toolbar .ic.primary:hover { background: #2f6fe0; color: #fff; }
  #orz-toolbar .orz-sep { width: 1px; height: 20px; background: #3c414a; margin: 0 5px; }
  #orz-toolbar .orz-spacer { flex: 1; }
  #orz-brand { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: #cdd3df; padding: 2px 7px; border-radius: 7px; }
  #orz-brand:hover { color: #fff; background: #383d45; }
  #orz-brand .orz-logo svg { height: 22px; width: auto; display: block; }
  #orz-brand .orz-brand-name { font: 700 13px/1 system-ui, sans-serif; letter-spacing: .01em; }
  #orz-brand .orz-gh { display: inline-flex; opacity: .55; }
  #orz-brand:hover .orz-gh { opacity: 1; }
  #orz-brand .orz-gh svg { width: 15px; height: 15px; display: block; }
  /* close tab — a small handle on the editor's right edge that slides it away */
  #orz-close {
    position: absolute; top: 50%; right: -19px; transform: translateY(-50%);
    width: 19px; height: 48px; z-index: 46; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    border: 0; border-radius: 0 8px 8px 0; background: #23262c; color: #c2c8d0;
    cursor: pointer; box-shadow: 2px 0 8px rgba(0,0,0,.18);
  }
  #orz-close:hover { background: #383d45; color: #fff; }
  #orz-close svg { width: 15px; height: 15px; display: block; }
  select.theme-pick {
    height: 30px; padding: 0 26px 0 10px; border: 1px solid #454b55; border-radius: 7px;
    background: #34383f no-repeat right 8px center; color: #e6e8ec;
    font: 500 12.5px/1 system-ui, sans-serif; cursor: pointer; max-width: 42%;
    -webkit-appearance: none; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23aab2bd' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  }

  /* ---- preview: fixed full-window wrapper; shifts right in edit mode ---- */
  #orz-preview { position: fixed; inset: 0; left: 0; transition: left .22s ease; }
  [data-mode="edit"] #orz-preview { left: calc(var(--orz-split) + 6px); }
  #orz-frame { width: 100%; height: 100%; border: 0; background: #fff; display: block; }

  /* draggable divider between editor and preview */
  #orz-divider { display: none; }
  [data-mode="edit"] #orz-divider { display: block; position: fixed; top: 0; bottom: 0;
    left: var(--orz-split); width: 6px; z-index: 45; cursor: col-resize; background: #34383f; }
  #orz-divider:hover, #orz-divider.dragging { background: #3b82f6; }

  /* pencil FAB (opens the editor); bottom-left, where the editor slides in from */
  #orz-edit-fab {
    position: fixed; left: 22px; bottom: 18px; z-index: 30;
    width: 42px; height: 42px; border: 0; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--c-accent); color: #fff; cursor: pointer;
    box-shadow: var(--c-shadow); opacity: .92;
  }
  #orz-edit-fab svg { width: 19px; height: 19px; display: block; }
  #orz-edit-fab:hover { opacity: 1; transform: scale(1.06); }
  #orz-edit-fab::after { content: ""; position: absolute; top: 1px; right: 1px;
    width: 11px; height: 11px; border-radius: 50%; background: #e5534b;
    border: 2px solid var(--c-bg); opacity: 0; transition: opacity .15s; }
  html[data-dirty="1"] #orz-edit-fab::after { opacity: 1; }
  [data-mode="edit"] #orz-edit-fab { display: none; }

  /* CodeMirror fills the editor area below the toolbar */
  #orz-editor { flex: 1; min-height: 0; overflow: hidden; background: #1f2228; }
  #orz-editor .CodeMirror { height: 100%; font-family: "SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 13.5px; line-height: 1.6; }
  #orz-textarea { width: 100%; height: 100%; box-sizing: border-box; border: 0; padding: 14px;
    resize: none; outline: none; font: 13.5px/1.6 ui-monospace, Menlo, Consolas, monospace;
    background: #1f2228; color: #e6e8eb; }

  /* banner buttons (update / served-note) */
  .text-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px;
    border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-bg); color: var(--c-fg);
    cursor: pointer; font: inherit; font-weight: 500; }
  .text-btn:hover { background: var(--c-hover); }
  .text-btn.primary { background: var(--c-accent); border-color: var(--c-accent); color: #fff; }
  .text-btn.primary:hover { filter: brightness(1.06); }

  /* toast */
  #orz-toast {
    position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%) translateY(8px);
    background: #111418; color: #fff; padding: 8px 14px; border-radius: 9px; font-size: 13px;
    opacity: 0; pointer-events: none; transition: opacity .18s, transform .18s; z-index: 50;
  }
  #orz-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* update banner */
  #orz-update {
    position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 40;
    display: none; align-items: center; gap: 12px;
    padding: 8px 12px; border-radius: 10px; font-size: 13px;
    background: var(--c-bg); color: var(--c-fg); border: 1px solid var(--c-border); box-shadow: var(--c-shadow);
  }
  #orz-update.show { display: flex; }

  /* published-page (read-only) save notice */
  #orz-served-note {
    position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 41;
    display: none; align-items: center; gap: 12px; max-width: min(92vw, 560px);
    padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.4;
    background: var(--c-bg); color: var(--c-fg); border: 1px solid var(--c-border); box-shadow: var(--c-shadow);
  }
  #orz-served-note.show { display: flex; }
  #orz-served-note .note-text { flex: 1; }
</style>
</head>
<body>

<div id="orz-preview"><iframe id="orz-frame" title="Preview"></iframe></div>
<div id="orz-divider" title="Drag to resize"></div>
<button id="orz-edit-fab" title="Edit this document" aria-label="Edit this document">${ICON.pencil}</button>

<div id="orz-panel">
  <div id="orz-toolbar" role="toolbar" aria-label="Editor toolbar">
    ${BRAND}
    <span class="orz-sep"></span>
    <button class="ic primary" id="orz-save" title="Save (Cmd/Ctrl+S)" aria-label="Save">${ICON.save}</button>
    <button class="ic" id="orz-download" title="Download a copy" aria-label="Download a copy">${ICON.download}</button>
    <span class="orz-spacer"></span>
    <button class="ic" id="orz-sync" title="Sync scrolling" aria-label="Sync scrolling" aria-pressed="true">${ICON.sync}</button>
    <select class="theme-pick" id="orz-theme" title="Theme" aria-label="Theme">${themeOptions}</select>
  </div>
  <button id="orz-close" title="Close editor" aria-label="Close editor">${ICON.collapse}</button>
  <div id="orz-editor"><textarea id="orz-textarea" spellcheck="false"></textarea></div>
</div>

<div id="orz-update">
  <span class="upd-text"></span>
  <button class="text-btn primary" id="orz-upd-apply">Update</button>
  <button class="text-btn" id="orz-upd-dismiss">Dismiss</button>
</div>

<div id="orz-served-note">
  <span class="note-text">This is a published page — your edits can't be saved back to the server. You can download a local copy to edit and save.</span>
  <button class="text-btn primary" id="orz-served-download">Download copy</button>
  <button class="text-btn" id="orz-served-dismiss">Dismiss</button>
</div>
<div id="orz-toast"></div>

<!-- Embedded markdown source (single source of truth) -->
<script type="text/markdown" id="orz-src">
${escapeForScript(opts.source)}
</script>

<!-- orz-markdown renderer (parent) -->
${rendererTag}

<!-- in-file app config + runtime -->
<script data-orz-asset="config">window.__ORZ_MDHTML__ = ${escapeForScript(JSON.stringify(config))};</script>
<script data-orz-asset="app">${escapeForScript(opts.appJs)}</script>
</body>
</html>
`;
}
