/**
 * The isomorphic assembler of orz-mdhtml (FC-18 text format 1, kind `md`).
 *
 * One module for every caller — the Node library, the CLI, the browser bundle
 * (FC-19 §2 `assemble` / `extract` / `readDocument`), "New document", "Save
 * as new copy", the quiet update and the starters — so Node and the browser
 * write the same bytes (FC-18 law 2).
 *
 * The envelope (doctype, `<html lang data-orz-kind>`, generator, `<title>`,
 * head metadata, `#orz-meta`, `#orz-shell`, the agent banner, the `#orz-src`
 * island and `#orz-includes`) is the kit's `assembleEnvelope`; this module adds
 * only the shell parts of the 1.0 shell.
 *
 * Rules: no Node built-ins, no clock, no randomness (except `newDocument`'s
 * `mintUid`, a creation tool, FC-18 §10), no environment reads. The shell
 * version is the generated constant in ./version.ts.
 */
import { assembleEnvelope, editHeader, extract, lintHeader, mintUid, UID_PATTERN, type HeaderChange, type ShellParts } from 'orz-markdown/carrier';
import { bundleUrl, isScriptSafe } from 'orz-markdown/carrier/shell';
import { isThemeId } from './themes.js';
import { isMeasure, presentationOf, readViewMarkup, shellHead, type Measure, type Presentation } from './presentation.js';
import { VERSION } from './version.js';

export { extract, readDocument } from 'orz-markdown/carrier';
export type { Extracted, DocumentInfo, Kind } from 'orz-markdown/carrier';

/** The browser bundle's file name inside `orz-mdhtml-browser` (its `release.json` `bundle.path`). */
export const BUNDLE_FILE = 'orz-mdhtml.browser.js';

/** The text formats this shell reads and writes (FC-18 §8.4). */
export const FORMATS: readonly number[] = Object.freeze([1]);

/** The jsDelivr URL of the browser bundle of a release (the same URL the quiet update derives, spec/shell-runtime.md §6). */
export function cdnBundleUrl(version: string = VERSION): string {
  return bundleUrl({ kind: 'md', version, bundle: { path: BUNDLE_FILE, integrity: '' } });
}

/** Options of {@link assemble} (FC-18 §8.2, FC-19 §2). */
export interface AssembleOptions {
  /** `inline` (default, FD-02) inlines the engine; `cdn` loads it from jsDelivr. */
  delivery?: 'inline' | 'cdn';
  /**
   * The exact text of the browser bundle, inlined for `delivery: 'inline'`
   * (required there: this module reads no files; the Node library and the
   * browser bundle supply it). Must be script-safe (no `<script`, `</script`
   * or CR — the bundle rule, spec/shell-runtime.md §6).
   */
  engineSource?: string;
  /** Resolved includes, stored in `#orz-includes` exactly as given (FC-18 §8.3, D4). */
  includes?: Record<string, string>;
}

/**
 * The id of the element the standalone chrome mounts on (its shadow root holds
 * every control; the page's own CSS never reaches it).
 */
export const CHROME_MOUNT_ID = 'orz-chrome';

/**
 * Assemble the `.md.html` file of a text (FC-18 §8): the kit's envelope with
 * kind `md`, shell version {@link VERSION}, and the 1.0 shell parts — in
 * `<head>` the viewport, colour scheme and the stylesheets the header's
 * `theme` names; in `<body>` the read view (`#orz-view` / `#orz-doc`, with the
 * header's `measure`), the chrome mount point (`#orz-chrome`) and the engine
 * (`#orz-engine`, inline or from jsDelivr).
 *
 * Deterministic: the same text, options and version give the same bytes.
 * Throws for a text the envelope refuses (NUL, a lone surrogate, a header
 * `format` above 1), an unknown delivery, a missing or script-unsafe
 * `engineSource` for inline delivery.
 */
export function assemble(text: string, options: AssembleOptions = {}): string {
  return assembleEnvelope(text, shellParts(options, presentationOf(text)));
}

/**
 * The shell parts {@link assemble} hands to the kit's `assembleEnvelope`: kind
 * `md`, shell version {@link VERSION}, delivery, head and body parts, and the
 * includes. They depend on the options and on the presentation (the header's
 * `theme` and `measure`, resolved by `presentationOf`) only — never on other
 * document data (FC-18 §8.1: theme presentation is applied by the shell parts,
 * not the envelope). Throws as {@link assemble} does for the options.
 */
export function shellParts(options: AssembleOptions = {}, presentation: Presentation = presentationOf('')): ShellParts {
  const delivery = options.delivery ?? 'inline';
  let engine: string;
  if (delivery === 'inline') {
    const src = options.engineSource;
    if (typeof src !== 'string' || src === '') throw new Error('orz-mdhtml: inline delivery needs the engine source (options.engineSource)');
    if (!isScriptSafe(src)) throw new Error('orz-mdhtml: the engine source is not script-safe (it holds <script, </script or a CR)');
    engine = `<script id="orz-engine">${src}</script>`;
  } else if (delivery === 'cdn') {
    engine = `<script id="orz-engine" src="${cdnBundleUrl()}"></script>`;
  } else {
    throw new Error(`orz-mdhtml: unknown delivery ${JSON.stringify(String(delivery))}`);
  }
  const includes = options.includes && Object.keys(options.includes).length > 0 ? options.includes : undefined;
  return {
    kind: 'md',
    shellVersion: VERSION,
    delivery,
    headHtml: shellHead(presentation, { deferred: true }),
    bodyHtml: `${readViewMarkup(presentation)}\n<div id="${CHROME_MOUNT_ID}"></div>\n${engine}`,
    ...(includes ? { includes } : {}),
  };
}

/**
 * The text a file assembled from `text` holds: `extract(assemble(text)).text`
 * — `text` itself, except that mixed line endings are stored as one style
 * (FC-18 §8.2, the first line break's). Compare a file's text with this, not
 * with the raw input. A text the envelope refuses is returned as it is.
 */
export function storedText(text: string): string {
  try {
    return extract(assembleEnvelope(text, shellParts({ delivery: 'cdn' }, presentationOf(''))))?.text ?? text;
  } catch {
    return text;
  }
}

/** Options of {@link newDocument}: header values of the new text (FC-18 §5.1). */
export interface NewDocumentOptions {
  title?: string;
  /** A theme id of {@link THEMES}. */
  theme?: string;
  /** `normal` / `wide` / `full`. */
  measure?: Measure;
  /** BCP 47 language of the content. */
  lang?: string;
  /** The document id; minted with the kit's `mintUid` when absent (tests inject one). */
  uid?: string;
}

/**
 * A new format-1 `md` text (FC-18 §3, §10): a header `{{nyml` / `kind:
 * document` / `carrier: md` / `uid` / the given keys / `}}`, then a short
 * starter body. Pure apart from `mintUid` when no `uid` is given.
 *
 * Throws for an unknown theme or measure, a malformed uid, a value the header
 * cannot hold (line break, `}}`, NUL), or a value lint reports as an error.
 */
export function newDocument(options: NewDocumentOptions = {}): string {
  const { title, theme, measure, lang } = options;
  if (theme !== undefined && !isThemeId(theme)) throw new Error(`orz-mdhtml: unknown theme ${JSON.stringify(theme)}`);
  if (measure !== undefined && !isMeasure(measure)) throw new Error(`orz-mdhtml: unknown measure ${JSON.stringify(measure)} (normal, wide or full)`);
  const uid = options.uid ?? mintUid();
  if (!UID_PATTERN.test(uid)) throw new Error(`orz-mdhtml: malformed uid ${JSON.stringify(uid)} (doc- and 10 to 32 of [0-9a-z])`);
  const heading = title !== undefined && title.trim() !== '' ? title.trim() : 'Untitled';
  const body = `# ${heading}\n\nStart writing here.\n`;
  const changes: Record<string, HeaderChange> = { carrier: 'md', uid };
  if (title !== undefined && title.trim() !== '') changes['title'] = title;
  if (theme !== undefined) changes['theme'] = theme;
  if (measure !== undefined) changes['measure'] = measure;
  if (lang !== undefined) changes['lang'] = lang;
  const text = editHeader(body, changes);
  const errors = lintHeader(text, 'md').filter((l) => l.level === 'error');
  if (errors.length > 0) throw new Error(`orz-mdhtml: the new header is not valid: ${errors.map((l) => `${l.code} (${l.message})`).join('; ')}`);
  return text;
}
