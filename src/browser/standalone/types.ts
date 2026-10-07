/**
 * THE SEAM (REBUILD §3a owner decision 2): what the kind-independent
 * standalone startup (`standalone/app.ts`, `standalone/file.ts`,
 * `ui/widgets.ts`, `engine-source.ts`) needs from a carrier. Everything
 * behind this interface is kind-specific (md: `md/*` and `carrier.ts`);
 * everything in front of it is meant to move to orz-markdown `carrier/app`
 * before orz-paged, unchanged but for its imports.
 *
 * No md knowledge may cross this interface.
 */
import type { EditorHooks, EditorShell, TextEditorAdapter } from 'orz-markdown/carrier/editor';
import type { HostConnection, Saver } from 'orz-markdown/carrier/shell';
import type { SettingControl } from '../ui/widgets.js';

export type CarrierKindName = 'md' | 'slides' | 'paged';

/** What the standalone file passes to its own editor (FC-19 §4: saves use the file's saver and host). */
export interface StandaloneContext {
  /** The opened file's name (the saver's suggested name). */
  fileName: string;
  /** The file's assemble: its delivery, the given includes (FC-19 §8.5). */
  assemble(text: string, options?: { includes?: Record<string, string> }): Promise<string>;
  /** The page's one saver (its session handle, its content proof, its host). */
  saver: Saver;
  host?: HostConnection;
  /** The opened file's `#orz-includes`. */
  includes?: Record<string, string>;
  /** The opened file's bytes (the saver's content proof, shell-runtime §1 step 3). */
  openedHtml?: () => Promise<string>;
  /** The page is this file, top-level, with no host (the preview's `file:` sandbox rule, FC-19 §8.4). */
  standalone: boolean;
  /** The host's AI operations (orz-host-ai@1) as an FC-19 AI hook. */
  ai?: EditorHooks['ai'];
  /** The host's include resolution (orz-host-include@1). */
  fetchInclude?: EditorHooks['fetchInclude'];
  /** The editing engine (tests). */
  adapter?: TextEditorAdapter;
}

/** The read view a carrier renders into the page (md: in the page; slides/paged: their own). */
export interface CarrierReadView {
  /** Render a text (its presentation follows its header); resolves when it shows. */
  render(text: string, ctx: { includes?: Readonly<Record<string, string>>; fetchInclude?(url: string): Promise<string | null> }): Promise<void>;
  /** Apply a text's presentation (theme, measure…) without re-rendering; returns its colour scheme. */
  present(text: string): { theme: { scheme: 'light' | 'dark' } };
}

/** A carrier as the standalone startup sees it. */
export interface StandaloneKind {
  kind: CarrierKindName;
  /** The shell version (= the package version, FC-19 §7). */
  version: string;
  /** The text formats it reads and writes. */
  formats: readonly number[];
  /** The carrier's isomorphic assemble (FC-19 §2). */
  assemble(text: string, options: { delivery?: 'inline' | 'cdn'; engineSource?: string; includes?: Record<string, string> }): Promise<string>;
  /** A new document text (the carrier's creation tool: header with `carrier` and a fresh `uid`). */
  newDocument(): string;
  /** Mount the carrier's editor for this file (`mountEditor` with the standalone context). */
  mountEditor(element: HTMLElement, options: { text: string }, ctx: StandaloneContext): EditorShell;
  /** Re-read host-provided tools (AI operations) of an editor it mounted. */
  refreshEditorTools?(editor: EditorShell): void;
  /** The page's read view. */
  createReadView(doc: Document): CarrierReadView;
  /** The header settings the chrome offers (md: theme, measure). */
  settings: readonly SettingControl[];
}
