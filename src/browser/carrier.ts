/**
 * The orz-mdhtml browser API (FC-19 §2): what `globalThis.OrzCarrier` holds
 * in the IIFE bundle and what the ESM build exports — `kind`, `version`,
 * `formats`, `assemble`, `extract`, `readDocument`, `mountEditor`,
 * `renderPreview`.
 *
 * KIND-SPECIFIC (md): `mountEditor` wraps the kit's `createEditorShell`
 * (orz-markdown `carrier/editor`, FC-19 §8) with the md renderer, the md
 * theme and measure in the preview head, and the md settings (theme, measure)
 * in the toolbar slot; `assemble` is the isomorphic assembler of
 * src/assemble.ts — the same function the Node library runs, so Node and the
 * browser write the same bytes (FC-18 law 2).
 */
import { extract as kitExtract, readDocument as kitReadDocument, type DocumentInfo, type Extracted, type HeaderChange } from 'orz-markdown/carrier';
import { codemirror6Adapter, createEditorShell, type EditorHooks, type EditorShell } from 'orz-markdown/carrier/editor';
import type { PreferenceStore } from 'orz-markdown/carrier/shell';
import type { StandaloneContext } from './standalone/types.js';
import { assemble as assembleSync, cdnBundleUrl, FORMATS, type AssembleOptions } from '../assemble.js';
import { presentationOf, previewHead, articleClass, shellHead, type Presentation } from '../presentation.js';
import { VERSION } from '../version.js';
import { engineSource, inlineEngineSource } from './engine-source.js';
import { renderMd } from './md/render.js';
import { MD_SETTINGS } from './md/settings.js';
import { installCss, menuButton, reviewProposal, settingPicker, WIDGET_CSS, type AiOp, type MenuButton, type SettingControl } from './ui/widgets.js';

export const kind = 'md' as const;
export const version: string = VERSION;
export const formats: number[] = [...FORMATS];

export type { DocumentInfo, Extracted, HeaderChange, EditorHooks, PreferenceStore };

/**
 * Assemble the `.md.html` file of a text (FC-19 §2, FC-18 §8): the same bytes
 * as the Node library's `assemble` for the same options. `delivery` defaults to
 * `inline`; an inline file carries `engineSource` — by default this bundle's
 * own text (inline at once; fetched from its URL when loaded by URL or as
 * ESM). `includes` go into `#orz-includes` as given. Rejects what the Node
 * `assemble` throws for.
 */
export function assemble(text: string, options: AssembleOptions = {}): Promise<string> {
  try {
    if ((options.delivery ?? 'inline') === 'inline' && options.engineSource === undefined) {
      const own = inlineEngineSource();
      if (own === null) return engineSource(cdnBundleUrl()).then((src) => assembleSync(text, { ...options, engineSource: src }));
      return Promise.resolve(assembleSync(text, { ...options, engineSource: own }));
    }
    return Promise.resolve(assembleSync(text, options));
  } catch (e) {
    return Promise.reject(e);
  }
}

/** The text of an assembled file (the kit's `extract`), or null for HTML that is not one. */
export function extract(html: string): Extracted | null {
  return kitExtract(html);
}

/** The header and derived facts of an md text, without rendering (the kit's `readDocument`, kind `md`). */
export function readDocument(text: string): DocumentInfo {
  return kitReadDocument(text, { kind: 'md' });
}

/** Options of {@link renderPreview}. */
export interface RenderPreviewOptions {
  /** URL include → text (the app's trust policy); without it URL includes stay directives. */
  fetchInclude?(target: string): Promise<string | null>;
  /** Resolved includes (`extract(html).includes`): target as written → text. */
  includes?: Readonly<Record<string, string>>;
  /** `false`: links as written; default `true` (links to text twins point at their `.html` form). */
  twinLinks?: boolean;
  /**
   * `true`: a whole HTML document (theme, KaTeX and highlight.js stylesheets of
   * the header's theme, the article with its measure) for a sandboxed iframe's
   * `srcdoc` — without scripts. Default `false`: the article's inner HTML.
   */
  document?: boolean;
}

/**
 * Read-only HTML of a text for an app (thumbnails, read views): the article's
 * inner HTML (or, with `document: true`, a script-free HTML document). Put it
 * in a sandboxed frame: a document's raw HTML is not filtered (orz-markdown
 * M.21: documents come from trusted sources).
 */
export async function renderPreview(text: string, options: RenderPreviewOptions = {}): Promise<string> {
  const inner = await renderMd(text, {
    ...(options.fetchInclude ? { fetchInclude: options.fetchInclude } : {}),
    ...(options.includes ? { includes: options.includes } : {}),
    ...(options.twinLinks === false ? { twinLinks: false } : {}),
  });
  if (!options.document) return inner;
  const p = presentationOf(text);
  const info = readDocument(text);
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!doctype html>\n<html lang="${esc(info.lang)}">\n<head>\n<meta charset="utf-8">\n<title>${esc(info.title)}</title>\n${shellHead(p)}\n</head>\n<body>\n<article class="${articleClass(p.measure)}">${inner}</article>\n</body>\n</html>\n`;
}

// ── mountEditor ─────────────────────────────────────────────────────────────

/** FC-19 §3 `EditorOptions`, plus orz-mdhtml's additive `nonce`. */
export interface EditorOptions {
  /** The document (FC-18), exact. */
  text: string;
  /** Always `md` for this carrier (accepted for FC-19 compatibility). */
  kind?: 'md';
  readOnly?: boolean;
  mode?: 'split' | 'editor' | 'preview';
  /** `full` (labels), `compact` (icons), `none` (no toolbar: the app drives the API). */
  chrome?: 'full' | 'compact' | 'none';
  hooks?: EditorHooks;
  /** Reader preferences (FC-18 §6); default: localStorage, namespaced by the header uid. */
  preferences?: PreferenceStore;
  /**
   * orz-mdhtml extension (additive; FC-19 §8.4 CSP recipe): a CSP nonce
   * stamped on the preview frame's scripts and styles and on CodeMirror's
   * `<script>` / `<style>`. Needed under a nonce-based `script-src`.
   */
  nonce?: string;
}

/** The Editor of FC-19 §4 (the kit's editor shell, which implements it). */
export type Editor = EditorShell;

/** Internal handles of a mounted md editor (the standalone startup uses them). */
export interface MdEditorInternals {
  /** Re-read the AI operations (a host's AI hello arrived after mount). */
  refreshTools(): void;
}

const internals = new WeakMap<object, MdEditorInternals>();

/** The internals of an editor this module mounted. */
export function editorInternals(editor: object): MdEditorInternals | undefined {
  return internals.get(editor);
}

const debounce = (win: Window, fn: () => void, ms: number): { run(): void; cancel(): void } => {
  let t: number | null = null;
  return {
    run() { if (t !== null) win.clearTimeout(t); t = win.setTimeout(() => { t = null; fn(); }, ms); },
    cancel() { if (t !== null) win.clearTimeout(t); t = null; },
  };
};

/**
 * Mount the md editor (FC-19 §3–4) in `element`: the kit's editor shell with
 * the md preview renderer, the header's theme and measure in the preview (they
 * follow header edits), and the md settings and AI operations in its toolbar.
 *
 * With `hooks.save` the app owns persistence (FC-19 §8.5 app host). Without it
 * the standalone save runs: in an assembled file through the file's own saver,
 * host connection, delivery and includes; elsewhere an inline assembly through
 * the File System Access picker or a download.
 */
export function mountEditor(element: HTMLElement, options: EditorOptions, standalone?: StandaloneContext): Editor {
  if (!element || typeof element !== 'object') throw new TypeError('orz-mdhtml: mountEditor needs an element');
  if (!options || typeof options.text !== 'string') throw new TypeError('orz-mdhtml: options.text must be a string');
  const doc = element.ownerDocument;
  const win = doc.defaultView!;
  const appHooks: EditorHooks = options.hooks ?? {};
  const isApp = typeof appHooks.save === 'function';
  const ctx = isApp ? undefined : standalone;

  // the AI hook: the app's, or the file's host; requests started from the toolbar menu are reviewed before they apply
  const innerAi = appHooks.ai ?? ctx?.ai;
  let reviewing: { root: ShadowRoot; title: string } | null = null;
  const ai: EditorHooks['ai'] | undefined = innerAi && {
    get operations() { return innerAi.operations; },
    async request(op, c) {
      const review = reviewing;
      reviewing = null;
      const r = await innerAi.request(op, c);
      if (!review) return r;
      const applied = await reviewProposal(review.root, r.proposed, { passage: !!c.selection, title: review.title });
      if (applied === null) throw new Error('cancelled');
      return { proposed: applied };
    },
  };
  const fetchInclude = appHooks.fetchInclude ?? ctx?.fetchInclude;
  const hooks: EditorHooks = { ...appHooks, ...(ai ? { ai } : {}), ...(fetchInclude ? { fetchInclude } : {}) };

  let presented: Presentation = presentationOf(options.text);
  const includes = ctx?.includes;
  const adapter = ctx?.adapter ?? (options.nonce ? codemirror6Adapter({ nonce: options.nonce }) : undefined);

  const shell = createEditorShell(element as never, {
    text: options.text,
    render: (t, rctx) => renderMd(t, { ...rctx, ...(includes ? { includes } : {}) }),
    kind: 'md',
    formats: [...FORMATS],
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.readOnly ? { readOnly: true } : {}),
    ...(options.chrome ? { chrome: options.chrome } : {}),
    ...(options.preferences ? { preferences: options.preferences } : {}),
    ...(adapter ? { adapter } : {}),
    hooks,
    ...(isApp ? {} : ctx ? {
      assemble: ctx.assemble,
      fileName: ctx.fileName,
      saver: ctx.saver,
      ...(ctx.host ? { host: ctx.host } : {}),
      ...(ctx.includes ? { includes: ctx.includes } : {}),
      ...(ctx.openedHtml ? { openedHtml: ctx.openedHtml } : {}),
      standalone: ctx.standalone,
    } : {
      // no hooks.save and no file: an inline file of the text, through the picker or a download
      assemble: (t: string, o?: { includes?: Record<string, string> }) => assemble(t, { ...(o?.includes ? { includes: o.includes } : {}) }),
    }),
    preview: {
      head: previewHead(presented),
      scheme: presented.theme.scheme,
      ...(options.nonce ? { nonce: options.nonce } : {}),
    },
  });

  // ── the carrier's tools in the toolbar slot (FC-19 §1: the same tools for every host) ──
  const pickers: MenuButton[] = [];
  let aiButton: MenuButton | null = null;
  const toolbar = shell.toolbar as unknown as HTMLElement | null;
  const root = shell.root as unknown as ShadowRoot;
  if (toolbar) {
    installCss(root, WIDGET_CSS);
    const compact = options.chrome === 'compact';
    for (const control of MD_SETTINGS as SettingControl[]) {
      const p = settingPicker(doc, control, () => shell.getText(), (key, value) => {
        try { shell.setHeader({ [key]: value }); } catch { /* the header refuses: nothing changed */ }
      }, { iconOnly: compact });
      pickers.push(p);
      toolbar.append(p.element);
    }
  }
  const aiOps = (): AiOp[] => (ai ? (Array.isArray(ai.operations) ? ai.operations : []) : []);
  const refreshTools = (): void => {
    if (!toolbar) return;
    const ops = aiOps();
    if (ops.length === 0) { aiButton?.destroy(); aiButton = null; return; }
    if (aiButton) return;
    aiButton = menuButton(doc, {
      label: 'AI',
      icon: 'info',
      heading: 'AI',
      items: () => aiOps().map((op) => ({
        label: op.title,
        run: () => {
          reviewing = { root, title: op.title };
          void shell.requestAi(op.id, op.selection ? { selection: true } : {}).finally(() => { reviewing = null; });
        },
      })),
    });
    toolbar.append(aiButton.element);
  };
  refreshTools();

  // ── the preview follows the header's theme and measure ──
  const follow = debounce(win, () => {
    const p = presentationOf(shell.getText());
    if (p.theme.id === presented.theme.id && p.measure === presented.measure) return;
    presented = p;
    shell.preview.setOptions({ head: previewHead(p), scheme: p.theme.scheme });
  }, 200);
  const offChange = shell.on('change', () => follow.run());

  const destroy = shell.destroy.bind(shell);
  shell.destroy = () => {
    follow.cancel();
    offChange();
    for (const p of pickers) p.destroy();
    aiButton?.destroy();
    destroy();
  };
  internals.set(shell, { refreshTools });
  return shell;
}

/** Re-exported for apps: the header edit the pickers apply (FC-18 §9). */
export { editHeader } from 'orz-markdown/carrier';
