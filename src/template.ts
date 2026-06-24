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

export function buildHtml(opts: TemplateOptions): string {
  const rendererTag =
    opts.renderer.mode === 'inline'
      ? `<script>${escapeForScript(opts.renderer.js)}</script>`
      : `<script src="${opts.renderer.src}"></script>`;

  const defaultScheme =
    opts.themes.find((t) => t.id === opts.defaultTheme)?.scheme ?? 'light';

  // Everything the app needs to (re)build the iframe + manage themes.
  const config = {
    filename: opts.filename,
    rendererVersion: opts.rendererVersion,
    versionManifest: opts.versionManifest,
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
<html lang="en" data-mode="read" data-chrome="${defaultScheme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="generator" content="orz-mdhtml">
<style>
  :root {
    --chrome-h: 46px;
    --fab-size: 40px;
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

  /* ---- toolbar (hidden while reading) ---- */
  #orz-bar {
    height: var(--chrome-h); flex: 0 0 var(--chrome-h);
    display: none; align-items: center; gap: 8px;
    padding: 0 10px; background: var(--c-bg);
    border-bottom: 1px solid var(--c-border);
    -webkit-user-select: none; user-select: none;
  }
  html:not([data-mode="read"]) #orz-bar { display: flex; }
  .bar-spring { flex: 1; }
  .bar-group { display: flex; align-items: center; gap: 2px; }
  .seg {
    display: inline-flex; background: var(--c-hover);
    border: 1px solid var(--c-border); border-radius: 8px; padding: 2px;
  }
  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border: 0; border-radius: 7px;
    background: transparent; color: var(--c-fg); cursor: pointer;
    transition: background .12s, color .12s;
  }
  .icon-btn:hover { background: var(--c-hover); }
  .seg .icon-btn:hover { background: var(--c-bg); }
  .seg .icon-btn[aria-pressed="true"] { background: var(--c-bg); color: var(--c-accent); box-shadow: var(--c-shadow); }
  .icon-btn svg { width: 17px; height: 17px; display: block; }
  .text-btn {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px;
    border: 1px solid var(--c-border); border-radius: 8px;
    background: var(--c-bg); color: var(--c-fg); cursor: pointer; font: inherit; font-weight: 500;
  }
  .text-btn:hover { background: var(--c-hover); }
  .text-btn.primary { background: var(--c-accent); border-color: var(--c-accent); color: #fff; }
  .text-btn.primary:hover { filter: brightness(1.06); }
  .bar-title {
    font-weight: 600; color: var(--c-fg); max-width: 38vw;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .dirty-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-accent);
    margin-left: 2px; opacity: 0; transition: opacity .15s; }
  html[data-dirty="1"] .dirty-dot { opacity: 1; }
  select.theme-pick {
    height: 30px; padding: 0 26px 0 10px; border: 1px solid var(--c-border); border-radius: 8px;
    background: var(--c-bg) no-repeat right 8px center; color: var(--c-fg); font: inherit; cursor: pointer;
    -webkit-appearance: none; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  }

  /* ---- stage: editor pane + preview iframe ---- */
  #orz-stage { flex: 1; display: flex; min-height: 0; position: relative; }
  #orz-editor { display: none; min-width: 0; height: 100%; background: var(--c-bg); }
  #orz-frame { flex: 1; min-width: 0; height: 100%; width: 100%; border: 0; background: #fff; display: block; }

  html[data-mode="read"]    #orz-editor { display: none; }
  html[data-mode="read"]    #orz-frame  { flex: 1; }
  html[data-mode="editor"]  #orz-editor { display: block; flex: 1; }
  html[data-mode="editor"]  #orz-frame  { display: none; }
  html[data-mode="preview"] #orz-editor { display: none; }
  html[data-mode="preview"] #orz-frame  { flex: 1; }
  html[data-mode="split"]   #orz-editor { display: block; }
  html[data-mode="split"]   #orz-frame  { border-left: 1px solid var(--c-border); }

  /* CodeMirror fills the editor pane */
  #orz-editor .CodeMirror { height: 100%; font-family: "SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 13.5px; line-height: 1.6; }
  #orz-textarea { width: 100%; height: 100%; box-sizing: border-box; border: 0; padding: 16px;
    resize: none; outline: none; font: 13.5px/1.6 ui-monospace, Menlo, Consolas, monospace;
    background: var(--c-bg); color: var(--c-fg); }

  /* Split.js gutter */
  .gutter { background: var(--c-border); position: relative; }
  .gutter.gutter-horizontal { cursor: col-resize; width: 8px; }
  .gutter.gutter-horizontal::after { content: ""; position: absolute; inset: 0 3px;
    border-radius: 3px; background: transparent; transition: background .12s; }
  .gutter.gutter-horizontal:hover::after { background: var(--c-accent); }

  /* ---- floating edit affordance (reading mode only) ---- */
  #orz-fab {
    position: fixed; right: 18px; bottom: 18px; z-index: 30;
    width: var(--fab-size); height: var(--fab-size); border-radius: 50%;
    border: 1px solid var(--c-border); background: var(--c-fab-bg); color: var(--c-fab-fg);
    box-shadow: var(--c-shadow); cursor: pointer; display: none;
    align-items: center; justify-content: center; backdrop-filter: blur(8px);
    transition: transform .12s, opacity .2s; opacity: .55;
  }
  #orz-fab:hover { opacity: 1; transform: translateY(-1px); }
  #orz-fab svg { width: 18px; height: 18px; }
  html[data-mode="read"] #orz-fab { display: inline-flex; }

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
</style>
</head>
<body>

<div id="orz-bar" role="toolbar" aria-label="Editor toolbar">
  <button class="icon-btn" id="orz-done" title="Done — back to reading" aria-label="Done">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M5 12l6-6M5 12l6 6"/></svg>
  </button>
  <span class="bar-title" id="orz-title">${escapeHtml(opts.title)}</span>
  <span class="dirty-dot" title="Unsaved changes"></span>
  <span class="bar-spring"></span>

  <div class="seg" role="group" aria-label="View">
    <button class="icon-btn" data-view="editor" title="Editor only" aria-label="Editor only">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/></svg>
    </button>
    <button class="icon-btn" data-view="split" title="Split" aria-label="Split">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>
    </button>
    <button class="icon-btn" data-view="preview" title="Preview only" aria-label="Preview only">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
    </button>
  </div>

  <select class="theme-pick" id="orz-theme" title="Theme" aria-label="Theme">${themeOptions}</select>

  <button class="text-btn primary" id="orz-save" title="Save (Cmd/Ctrl+S)">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
    Save
  </button>
</div>

<div id="orz-stage">
  <div id="orz-editor"><textarea id="orz-textarea" spellcheck="false"></textarea></div>
  <iframe id="orz-frame" title="Preview"></iframe>
</div>

<button id="orz-fab" title="Edit this document" aria-label="Edit this document">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
</button>

<div id="orz-update">
  <span class="upd-text"></span>
  <button class="text-btn" id="orz-upd-dismiss">Dismiss</button>
</div>
<div id="orz-toast"></div>

<!-- Embedded markdown source (single source of truth) -->
<script type="text/markdown" id="orz-src">
${escapeForScript(opts.source)}
</script>

<!-- orz-markdown renderer (parent) -->
${rendererTag}

<!-- in-file app config + runtime -->
<script>window.__ORZ_MDHTML__ = ${escapeForScript(JSON.stringify(config))};</script>
<script>${escapeForScript(opts.appJs)}</script>
</body>
</html>
`;
}
