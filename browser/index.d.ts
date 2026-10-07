/**
 * Types of `orz-mdhtml-browser` (FC-19 §2–4): the IIFE's `globalThis.OrzCarrier`
 * and the ES module's named exports have this shape. Self-contained (no
 * dependency on orz-markdown's types); the full definitions live in
 * orz-markdown `carrier/editor` (FC-19 §8).
 */

export type Kind = 'md' | 'slides' | 'paged';
export type EditorMode = 'split' | 'editor' | 'preview';
export type HeaderChange = string | null | { multiline: string };

export interface AssembleOptions {
  /** `inline` (default) inlines the engine; `cdn` loads it from jsDelivr. */
  delivery?: 'inline' | 'cdn';
  /** The exact text of `orz-mdhtml.browser.js` for an inline file (default: this bundle's own text). */
  engineSource?: string;
  /** Resolved includes stored in `#orz-includes` exactly as given. */
  includes?: Record<string, string>;
}

export interface Extracted {
  text: string;
  kind: Kind;
  format: number;
  shell: string;
  delivery: string;
  includes?: Record<string, string>;
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
  /** orz-mdhtml extension: CSP nonce for the preview frame and CodeMirror (FC-19 §8.4). */
  nonce?: string;
}

export type SaveVia = 'hook' | 'host' | 'file' | 'download';
export type SaveOutcome = { ok: true; via: SaveVia } | { ok: false; via?: SaveVia | 'served-notice'; error: string; cancelled?: boolean };
export type AiOutcome = { ok: true; op: string } | { ok: false; error: string };
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
  requestAi(op: string, options?: { selection?: boolean }): Promise<AiOutcome>;
  uploadAssets(files: ArrayLike<File>): Promise<UploadOutcome>;
  ensureUid(): Promise<string>;
  setReadOnly(readOnly: boolean): void;
  isReadOnly(): boolean;
}

export interface RenderPreviewOptions {
  fetchInclude?(target: string): Promise<string | null>;
  includes?: Readonly<Record<string, string>>;
  twinLinks?: boolean;
  /** A whole script-free HTML document instead of the article's inner HTML. */
  document?: boolean;
}

export declare const kind: 'md';
export declare const version: string;
export declare const formats: number[];
export declare function assemble(text: string, options?: AssembleOptions): Promise<string>;
export declare function extract(html: string): Extracted | null;
export declare function readDocument(text: string): DocumentInfo;
export declare function renderPreview(text: string, options?: RenderPreviewOptions): Promise<string>;
export declare function mountEditor(element: HTMLElement, options: EditorOptions): Editor;
export declare function editHeader(text: string, changes: Readonly<Record<string, HeaderChange>>): string;
export declare const THEMES: ReadonlyArray<{ id: string; name: string; scheme: 'light' | 'dark' }>;
export declare const DEFAULT_THEME: string;
export declare const MEASURES: readonly ['normal', 'wide', 'full'];

export interface OrzCarrierApi {
  kind: 'md';
  version: string;
  formats: number[];
  assemble: typeof assemble;
  extract: typeof extract;
  readDocument: typeof readDocument;
  mountEditor: typeof mountEditor;
  renderPreview: typeof renderPreview;
}
export declare const OrzCarrier: OrzCarrierApi;

declare global {
  // eslint-disable-next-line no-var
  var OrzCarrier: OrzCarrierApi | undefined;
}
