/**
 * Types of `orz-mdhtml-browser` (FC-19 §2–4): the IIFE's `globalThis.OrzCarrier`
 * and the ES module's named exports have this shape. Self-contained (no
 * dependency on orz-markdown's types); the full definitions live in
 * orz-markdown `carrier/editor` (FC-19 §8).
 */

export type Kind = 'md' | 'slides' | 'paged';
export type EditorMode = 'split' | 'editor' | 'preview';
export type HeaderChange = string | null | { multiline: string };
/**
 * The twin-link naming (FC-18 §8.2, orz-markdown 2.5.0): per kind, the file
 * name a host publishes a text twin under, as a template with `{stem}` once
 * (then only `A-Z a-z 0-9 . _ -`, ending in `.html`, same folder), e.g.
 * `{ md: '{stem}.html' }` (`x.md` → `x.html`). Kinds left out keep the
 * family's names (`x.md` → `x.md.html`).
 */
export type TwinNaming = Partial<Record<Kind, string>>;

export interface AssembleOptions {
  /** `inline` (default) inlines the engine; `cdn` loads it from jsDelivr. */
  delivery?: 'inline' | 'cdn';
  /** The exact text of `orz-mdhtml.browser.js` for an inline file (default: this bundle's own text). */
  engineSource?: string;
  /** Resolved includes stored in `#orz-includes` exactly as given. */
  includes?: Record<string, string>;
  /** The twin-link naming, stored in `#orz-shell` as `"links"` when it is not the family's (every save and update keeps it). An invalid naming rejects. */
  twinLinks?: TwinNaming;
}

export interface Extracted {
  text: string;
  kind: Kind;
  format: number;
  shell: string;
  delivery: string;
  includes?: Record<string, string>;
  /** The file's twin-link naming (`#orz-shell` `"links"`); absent: the family's. */
  twinLinks?: TwinNaming;
}

/** One link of a text ({@link linkTargets}). */
export interface LinkTarget {
  /** The target as the renderer writes it (a Markdown destination percent-encoded: `my%20file.md`; a raw `<a href>` as written). */
  href: string;
  /** 1-based line of the whole text (header lines counted). */
  line: number;
  /** `twin`: a relative link to a text twin (the twin-link rule rewrites it); `asset`: another relative or root-relative path (an image is never `twin`); `other`: an absolute URL, `//host`, or a fragment- or query-only href. */
  kind: 'twin' | 'asset' | 'other';
  /** A Markdown image (`![…](…)`): its `src`. */
  image: boolean;
  /** A raw-HTML `<a href>`: the renderer leaves it as written. */
  raw: boolean;
}

/** Options of {@link upgrade}: the assembly's, a uid for a 0.x file (default: a fresh one), and `downgrade`. */
export interface UpgradeOptions extends AssembleOptions {
  /** The uid a 0.x file without a valid one gets (e.g. from your `mintUid`); default: a fresh one. */
  uid?: string;
  /** Re-assemble a file whose shell is newer than this release (default `false`: rejected). */
  downgrade?: boolean;
}

/** What {@link upgrade} resolves to. */
export interface UpgradeResult {
  /** The text (a 0.x file: its source exactly, after a header with its metadata, title, theme, `carrier: md` and a uid). */
  text: string;
  /** The text's file, assembled with this release's shell. */
  html: string;
  /** `legacy` (a 0.x file) or `format-1` (a 1.x file, re-assembled with its text and includes). */
  from: 'legacy' | 'format-1';
  /** The header keys the upgrade wrote, with their values. */
  moved: Record<string, string>;
  /** What was found but not moved, and why: the normal conversions and the warnings. */
  notes: string[];
  /** The notes worth a warning (something not understood or not kept). */
  warnings: string[];
}

export interface Lint { level: 'error' | 'warning' | 'info'; code: string; message: string; line?: number; from?: number; to?: number }

export interface DocumentInfo {
  kind: Kind;
  format: number;
  header: { start: number; end: number; fields: Record<string, string>; keys: string[] } | null;
  meta: Record<string, unknown> & { title?: string; author?: string; uid?: string; keywords?: string[] };
  theme?: string;
  lang: string;
  settings: Record<string, string>;
  hostKeys: Record<string, string>;
  title: string;
  lint: Lint[];
}

export interface TextRange { from: number; to: number }
export interface AiOperation { id: string; title: string; selection: boolean }

export interface EditorHooks {
  /** App host: persist the text (absent: the standalone save). */
  save?(text: string): Promise<void>;
  ai?: { operations: AiOperation[]; request(op: string, ctx: { text: string; selection?: TextRange }): Promise<{ proposed: string }> };
  /** An include `includes` lacks: a URL, or a file include's path as written (your trust policy); null = not available. */
  fetchInclude?(target: string): Promise<string | null>;
  resolveAsset?(path: string): string;
  uploadAsset?(file: File): Promise<string>;
  resolveLink?(href: string): string;
  mintUid?(): Promise<string>;
}

export interface PreferenceStore {
  get(key: string): unknown;
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
  all(): Record<string, unknown>;
}

export interface EditorOptions {
  text: string;
  kind?: 'md';
  readOnly?: boolean;
  mode?: EditorMode;
  chrome?: 'full' | 'compact' | 'none';
  hooks?: EditorHooks;
  preferences?: PreferenceStore;
  /** FC-19 §3 `nonce`: your CSP nonce, stamped on the preview frame's and CodeMirror's scripts and styles (FC-19 §8.4). */
  nonce?: string;
  /** FC-19 §3 `includes`: resolved includes for the preview (target as written → text), read before `hooks.fetchInclude`; without `hooks.save` also stored in a saved file. */
  includes?: Record<string, string>;
  /** FC-19 §3 `fileName`: the suggested file name of saves without `hooks.save` (picker and download), e.g. `notes.md.html`; default `document.md.html`. */
  fileName?: string;
  /** FC-19 §3 `twinLinks` (2.5.0): your twin-link naming — the preview names links to text twins so (not with `hooks.resolveLink`), and a save without `hooks.save` stores it in the file. */
  twinLinks?: TwinNaming;
}

export type SaveVia = 'hook' | 'host' | 'file' | 'download';
export type SaveOutcome = { ok: true; via: SaveVia } | { ok: false; via?: SaveVia | 'served-notice'; error: string; cancelled?: boolean; conflict?: boolean };
export type AiOutcome = { ok: true; op: string } | { ok: false; error: string };
/** An AI proposal awaiting the reader's review (`proposeAi`); only the editor that made it can apply it (`applyAi`). */
export interface AiProposal {
  readonly op: string;
  /** The replacement the hook proposed. */
  readonly proposed: string;
  /** What it replaces: offsets in the text at the time of the request (the selection, or the whole text). */
  readonly range: Readonly<TextRange>;
  /** The exact text in `range` when the request was made. */
  readonly original: string;
  /** A passage (selection) operation; else the proposal replaces the whole document. */
  readonly passage: boolean;
}
export type AiProposalOutcome = { ok: true; op: string; proposal: AiProposal } | { ok: false; error: string };
export type UploadOutcome = { ok: true; inserted: string[] } | { ok: false; inserted: string[]; error: string };

export interface EditorEvents {
  change: { text: string };
  dirty: { dirty: boolean };
  selection: { from: number; to: number };
  save: { text: string; via: SaveVia };
  error: { source: 'save' | 'render' | 'adapter' | 'format' | 'hook'; message: string; error: unknown };
}

export interface Editor {
  getText(): string;
  setText(text: string, options?: { resetHistory?: boolean }): void;
  setHeader(changes: Record<string, HeaderChange>): void;
  undo(): boolean;
  redo(): boolean;
  isDirty(): boolean;
  markSaved(): void;
  save(): Promise<SaveOutcome>;
  setMode(mode: EditorMode): void;
  getMode(): EditorMode;
  focus(): void;
  on<E extends keyof EditorEvents>(event: E, fn: (e: EditorEvents[E]) => void): () => void;
  destroy(): void;
  /** Run an AI operation and apply its proposal at once (one undoable edit). */
  requestAi(op: string, options?: { selection?: boolean }): Promise<AiOutcome>;
  /** Run an AI operation and return its proposal without touching the text (the review flow). */
  proposeAi(op: string, options?: { selection?: boolean }): Promise<AiProposalOutcome>;
  /** Apply a reviewed proposal (optionally edited: `proposed`) as one undoable edit; refused if the text changed meanwhile. */
  applyAi(proposal: AiProposal, options?: { proposed?: string }): AiOutcome;
  uploadAssets(files: ArrayLike<File>): Promise<UploadOutcome>;
  ensureUid(): Promise<string>;
  setReadOnly(readOnly: boolean): void;
  isReadOnly(): boolean;
  /**
   * Render the preview now, also when the text has not changed. With
   * `includes`: the preview's include record is replaced by it (`null` or `{}`:
   * none) and fetched includes are read again (e.g. after the app resolved
   * one). Saves keep the includes the editor was mounted with.
   */
  refreshPreview(options?: { includes?: Record<string, string> | null }): Promise<void>;
  /** Resolves when the text engine is final: `codemirror6`, or `textarea` with the load error (the editor is usable before). */
  readonly ready: Promise<{ engine: string; error?: unknown }>;
}

export interface RenderPreviewOptions {
  fetchInclude?(target: string): Promise<string | null>;
  includes?: Readonly<Record<string, string>>;
  /** `false`: links as written; default `true` (the family's names, `x.md` → `x.md.html`); a {@link TwinNaming}: those names. */
  twinLinks?: boolean | TwinNaming;
  /**
   * A whole HTML document (the header's stylesheets, no engine script) instead
   * of the article's inner HTML. Either way the document's own raw HTML is kept
   * as written — show it in a sandboxed frame.
   */
  document?: boolean;
}

export declare const kind: 'md';
export declare const version: string;
export declare const formats: number[];
export declare function assemble(text: string, options?: AssembleOptions): Promise<string>;
export declare function extract(html: string): Extracted | null;
export declare function readDocument(text: string): DocumentInfo;
export declare function renderPreview(text: string, options?: RenderPreviewOptions): Promise<string>;
/**
 * orz-mdhtml's extension: upgrade an orz-mdhtml file in the browser, as the
 * Node library's `upgrade` does: a 0.x file keeps its title, metadata and
 * theme (in the header; `extract` of a 0.x file returns only its source).
 */
export declare function upgrade(html: string, options?: UpgradeOptions): Promise<UpgradeResult>;
export declare function mountEditor(element: HTMLElement, options: EditorOptions): Editor;
/** The include targets of a text's body, as written, in order, without repeats (as the renderer finds them; orz-markdown 2.5.0). */
export declare function includeTargets(text: string): string[];
/** Every Markdown link and image and every raw `<a href>` of a text's body, in order, as the renderer reads them (orz-markdown 2.5.0). */
export declare function linkTargets(text: string): LinkTarget[];
export declare function editHeader(text: string, changes: Readonly<Record<string, HeaderChange>>): string;
export declare const THEMES: ReadonlyArray<{ id: string; name: string; scheme: 'light' | 'dark' }>;
export declare const DEFAULT_THEME: string;
export declare const MEASURES: readonly ['normal', 'wide', 'full'];

/** How a save from an assembled file's page went. */
export interface StandaloneSaveOutcome { ok: boolean; via?: string; error?: string; cancelled?: boolean }

/**
 * The page-side handle of an assembled `.md.html` that booted (orz-markdown
 * `carrier/app` `CarrierApp`; `OrzCarrier.standalone`). Not part of FC-19:
 * tests, the conformance driver and scripts in a file's own page use it.
 */
export interface StandaloneFile {
  /** The current text: the document being edited (an editor mounted on the file), else the page's. */
  getText(): string;
  isDirty(): boolean;
  /** Enter edit mode (mounting the editor once) and return the editor. */
  edit(): Editor;
  /** Leave edit mode (the read view shows the current text). */
  leave(): Promise<void>;
  /** The Edit button's editor while editing, else null. */
  editor(): Editor | null;
  /** Write header settings as the pickers do (one undoable edit). */
  setSetting(changes: Record<string, HeaderChange>): void;
  undo(): boolean;
  redo(): boolean;
  /** Save the document (the editor's save while editing). Never rejects. */
  save(): Promise<StandaloneSaveOutcome>;
  download(): Promise<StandaloneSaveOutcome>;
  newDocument(): Promise<StandaloneSaveOutcome>;
  saveAsCopy(): Promise<StandaloneSaveOutcome>;
  /** Show a toast in the chrome. */
  toast(message: string, tone?: 'info' | 'success' | 'warning' | 'error'): void;
  /** True while a quiet update runs (the document is read-only). */
  readonly updating: boolean;
  /** Resolves when the first read view is in the page. */
  readonly ready: Promise<void>;
}

export interface OrzCarrierApi {
  kind: 'md';
  version: string;
  formats: number[];
  assemble: typeof assemble;
  extract: typeof extract;
  readDocument: typeof readDocument;
  mountEditor: typeof mountEditor;
  renderPreview: typeof renderPreview;
  /** orz-mdhtml's extension: upgrade an old file in the browser. */
  upgrade: typeof upgrade;
  /** The targets a text points at (orz-markdown 2.5.0). */
  includeTargets: typeof includeTargets;
  linkTargets: typeof linkTargets;
  /** The booted file's handle in an assembled `.md.html` (the IIFE only); null elsewhere. Not in the ES module's `OrzCarrier`. */
  readonly standalone?: StandaloneFile | null;
}
export declare const OrzCarrier: OrzCarrierApi;

declare global {
  // eslint-disable-next-line no-var
  var OrzCarrier: OrzCarrierApi | undefined;
}
