/**
 * orz-mdhtml — the Node library (the package's main export).
 *
 * Text format 1 (FC-18): a document is its text twin (`x.md`); its
 * self-editing file (`x.md.html`) is `assemble(text)`. Everything here is the
 * isomorphic code of src/assemble.ts, src/inspect.ts and src/legacy.ts — the
 * same functions the browser bundle runs — except that an inline assembly
 * needs no engine from the caller: it carries this release's browser bundle
 * (src/engine.ts: the copy staged in `dist/` by the build, verified against
 * its `release.json`), so Node writes the bytes the browser writes.
 *
 * 1.0.0 replaces the 0.9 API (`buildMdHtml`, `composeInlineMdHtml`,
 * `findRendererBundle`, `findAsset`, `orzVersionOf`, `selfVersionOf`): content
 * (title, theme, metadata) now comes only from the text's header.
 */
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';
import { assemble as assembleText, type AssembleOptions } from './assemble.js';
import { upgrade as upgradeFile, type UpgradeOptions, type UpgradeResult } from './legacy.js';
import { engineSource } from './engine.js';

export { extract, readDocument, newDocument, cdnBundleUrl, BUNDLE_FILE, FORMATS, type AssembleOptions, type NewDocumentOptions, type Extracted, type DocumentInfo, type Kind } from './assemble.js';
import { inspect as inspectInput, type InspectOptions, type InspectReport } from './inspect.js';
export type { InspectOptions, InspectReport } from './inspect.js';
export { readLegacy, type LegacyFile, type UpgradeResult, type UpgradeOptions } from './legacy.js';
export { THEMES, DEFAULT_THEME, isThemeId, type ThemeInfo } from './themes.js';
export { MEASURES, DEFAULT_MEASURE, type Measure } from './presentation.js';
export { VERSION } from './version.js';
export { engineSource, engineFiles, type EngineFiles } from './engine.js';

/** The orz-markdown version this release renders with (its themes, KaTeX and CodeMirror pins). */
export { ORZ_MARKDOWN_VERSION };

/** The engine of an inline assembly: the caller's, else this release's bundle. */
const withEngine = <T extends AssembleOptions>(o: T): T =>
  (o.delivery ?? 'inline') === 'inline' && o.engineSource === undefined ? { ...o, engineSource: engineSource() } : o;

/**
 * Assemble the `.md.html` file of a text (FC-18 §8, FC-19 §2): `inline`
 * (default) carries this release's browser bundle, `cdn` loads it from
 * jsDelivr. `includes` are stored in `#orz-includes` as given. Equal to the
 * browser bundle's `OrzCarrier.assemble` for the same text and options.
 *
 * Throws for a text the envelope refuses (NUL, a lone surrogate, a header
 * `format` above 1), an unknown delivery, and when the engine is missing or
 * not this release's (src/engine.ts).
 */
export function assemble(text: string, options: AssembleOptions = {}): string {
  return assembleText(text, withEngine(options));
}

/**
 * Upgrade an orz-mdhtml file to text format 1 with this shell: a legacy 0.x
 * file becomes a format-1 text (its source exactly, its metadata, title and
 * theme moved into the header) and that text's file; a format-1 file is
 * re-assembled with its text and includes unchanged. Inline by default (this
 * release's bundle), like {@link assemble}.
 */
export function upgrade(html: string, options: UpgradeOptions = {}): UpgradeResult {
  return upgradeFile(html, withEngine(options));
}

/**
 * Inspect a text or a file of any version (the isomorphic `inspect`): an
 * inline file of this shell version is checked against this release's
 * engine (`checks.engine`), unless `options.engineSource` says otherwise;
 * when the engine cannot be read here, the check says `unverified`.
 */
export function inspect(input: string, options: InspectOptions = {}): InspectReport {
  if (options.engineSource !== undefined) return inspectInput(input, options);
  let engine: string | undefined;
  try { engine = engineSource(); } catch { engine = undefined; }
  return inspectInput(input, { ...options, ...(engine !== undefined ? { engineSource: engine } : {}) });
}
