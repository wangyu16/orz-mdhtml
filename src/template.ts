/**
 * Builds the self-contained .md.html shell.
 *
 * The file embeds the markdown source in a <script type="text/markdown">, a
 * server-side pre-render for instant first paint, the orz-markdown browser
 * renderer (inline or CDN), and the in-file runtime (assets/app.js).
 */

export interface TemplateOptions {
  /** Raw markdown source. */
  source: string;
  /** Server-side pre-rendered HTML body (instant first paint, no-JS fallback). */
  renderedBody: string;
  /** Document title. */
  title: string;
  /** Base filename (no extension) used as the save suggestion. */
  filename: string;
  /** Theme CSS URL (CDN). */
  themeHref: string;
  /** orz-markdown version (for the version-check baseline). */
  rendererVersion: string;
  /** The in-file runtime (assets/app.js contents). */
  appJs: string;
  /** Renderer delivery: inline bundle JS, or a CDN <script src>. */
  renderer: { mode: 'inline'; js: string } | { mode: 'cdn'; src: string };
  /** jsDelivr resolved-version manifest URL (version check). Empty to disable. */
  versionManifest: string;
}

/** Guard the embedded source against premature </script> termination. */
function escapeForScript(s: string): string {
  return s.replace(/<\/(script)/gi, '<\\/$1');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildHtml(opts: TemplateOptions): string {
  const rendererTag =
    opts.renderer.mode === 'inline'
      ? `<script>${opts.renderer.js}</script>`
      : `<script src="${opts.renderer.src}"></script>`;

  const config = {
    filename: opts.filename,
    rendererVersion: opts.rendererVersion,
    versionManifest: opts.versionManifest,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="generator" content="orz-mdhtml">

<!-- Theme + math styles (CDN) -->
<link rel="stylesheet" href="${opts.themeHref}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">

<style>
  :root { --orz-toolbar-h: 44px; }
  html, body { margin: 0; padding: 0; }
  #orz-toolbar {
    position: sticky; top: 0; z-index: 50;
    display: flex; align-items: center; gap: 8px;
    height: var(--orz-toolbar-h); padding: 0 12px;
    background: rgba(127,127,127,.08); backdrop-filter: blur(6px);
    border-bottom: 1px solid rgba(127,127,127,.2); font: 13px system-ui, sans-serif;
  }
  #orz-toolbar button {
    font: inherit; padding: 5px 10px; cursor: pointer;
    border: 1px solid rgba(127,127,127,.35); border-radius: 6px; background: transparent;
  }
  #orz-toolbar .spacer { flex: 1; }
  #orz-update { display: flex; gap: 10px; align-items: center;
    padding: 6px 12px; background: #fff8c5; color: #5a4b00; font: 13px system-ui; }
  #orz-stage { display: flex; }
  #orz-editor { display: none; width: 50%; border-right: 1px solid rgba(127,127,127,.2); }
  #orz-source-input {
    width: 100%; height: calc(100vh - var(--orz-toolbar-h)); box-sizing: border-box;
    border: 0; padding: 16px; resize: none; outline: none;
    font: 13px/1.6 ui-monospace, Menlo, Consolas, monospace; background: transparent; color: inherit;
  }
  #orz-preview { box-sizing: border-box; padding: 24px; flex: 1; overflow-wrap: anywhere; }
  body[data-mode="edit"] #orz-editor { display: block; }
  body[data-mode="edit"] #orz-preview { width: 50%; flex: none; overflow: auto;
    height: calc(100vh - var(--orz-toolbar-h)); }
  body[data-mode="edit"] #orz-mode-edit { font-weight: 700; }
  body[data-mode="preview"] #orz-mode-preview { font-weight: 700; }
  #orz-toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: #333; color: #fff; padding: 8px 14px; border-radius: 8px; font: 13px system-ui; z-index: 100; }
</style>
</head>
<body data-mode="preview">

<div id="orz-toolbar">
  <button id="orz-mode-preview" type="button" title="Preview">Preview</button>
  <button id="orz-mode-edit" type="button" title="Edit source + preview">Edit</button>
  <span class="spacer"></span>
  <button id="orz-save" type="button" title="Save (Cmd/Ctrl+S)">Save</button>
</div>

<div id="orz-update" hidden>
  <span class="ver"></span>
  <span class="spacer" style="flex:1"></span>
  <button type="button" onclick="this.closest('#orz-update').hidden=true">Dismiss</button>
</div>

<div id="orz-stage">
  <div id="orz-editor">
    <textarea id="orz-source-input" spellcheck="false"></textarea>
  </div>
  <article id="orz-preview" class="markdown-body">
${opts.renderedBody}
  </article>
</div>

<div id="orz-toast" hidden></div>

<!-- Embedded markdown source (single source of truth) -->
<script type="text/markdown" id="orz-src">
${escapeForScript(opts.source)}
</script>

<!-- Render-time CDN helpers (parity with orz-markdown standalone output) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>if(window.mermaid)mermaid.initialize({startOnLoad:false});</script>

<!-- Copy-as-markdown stopgap (migrates into orz-markdown core runtime) -->
<script src="https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js"></script>
<script src="https://cdn.jsdelivr.net/npm/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js"></script>

<!-- orz-markdown renderer -->
${rendererTag}

<!-- in-file runtime config + app -->
<script>window.__ORZ_MDHTML__ = ${JSON.stringify(config)};</script>
<script>${opts.appJs}</script>
</body>
</html>
`;
}
