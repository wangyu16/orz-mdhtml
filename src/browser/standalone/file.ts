/**
 * KIND-INDEPENDENT: what the page knows about the assembled file it was
 * opened from — read from its own DOM at boot, never from anything the
 * document's content could forge after load (the envelope's islands are
 * written before any shell markup, FC-18 §8.1):
 *
 * - the text (`readIslandFromDom(#orz-src)`: exact, line endings and BOM
 *   restored), its header facts (uid, format);
 * - the shell (`#orz-shell`): its delivery (kept by every save, B#7);
 * - the resolved includes (`#orz-includes`, D4: a page cannot resolve them again);
 * - the engine (`#orz-engine` without `src`: the inline bundle's exact text);
 * - the file name (the page's last path segment when it is a file of this kind).
 */
import { readIslandFromDom, readHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { KIND_EXTENSIONS } from 'orz-markdown/carrier/shell';
import type { CarrierKindName } from './types.js';

export interface OpenedFile {
  text: string;
  /** The header `uid` when well-formed. */
  uid?: string;
  /** The header `format` (default 1). */
  format: number;
  delivery: 'inline' | 'cdn';
  includes?: Record<string, string>;
  /** The inline engine's exact text, or null for a cdn file. */
  engine: string | null;
  /** The opened file's name (`<x>.md.html`), else `document` + the kind's extension. */
  fileName: string;
}

/** The island element, or null when the page is not an assembled file (an app page, the update sandbox). */
export function sourceIsland(doc: Document): HTMLElement | null {
  const el = doc.getElementById('orz-src');
  return el && el.tagName === 'SCRIPT' && el.getAttribute('type') === 'text/markdown' ? el : null;
}

function shellDelivery(doc: Document): 'inline' | 'cdn' {
  try {
    const d = (JSON.parse(doc.getElementById('orz-shell')?.textContent ?? '{}') as { delivery?: unknown }).delivery;
    return d === 'cdn' ? 'cdn' : 'inline';
  } catch {
    return 'inline';
  }
}

/** `#orz-includes` read as `extract` reads it (string values only; own keys only). */
function shellIncludes(doc: Document): Record<string, string> | undefined {
  try {
    const el = doc.getElementById('orz-includes');
    if (!el) return undefined;
    const parsed = JSON.parse(el.textContent ?? '') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** The opened file's name when the page's URL names a file of this kind. */
export function openedFileName(loc: { pathname?: string } | undefined, kind: CarrierKindName): string {
  const ext = KIND_EXTENSIONS[kind];
  try {
    const last = decodeURIComponent((loc?.pathname ?? '').split('/').pop() ?? '');
    if (last.length > ext.length && last.endsWith(ext)) return last;
  } catch { /* a malformed path */ }
  return `document${ext}`;
}

/** The name a new copy of a file is offered under: `notes.md.html` → `notes copy.md.html`. */
export function copyName(fileName: string, kind: CarrierKindName): string {
  const ext = KIND_EXTENSIONS[kind];
  const base = fileName.endsWith(ext) ? fileName.slice(0, -ext.length) : fileName;
  return `${base} copy${ext}`;
}

/** Read the opened file from the page (null when the page is not one). */
export function readOpenedFile(doc: Document, kind: CarrierKindName): OpenedFile | null {
  const island = sourceIsland(doc);
  if (!island) return null;
  const text = readIslandFromDom(island);
  const fields = readHeader(text)?.fields ?? {};
  const uid = fields['uid']?.trim();
  const f = fields['format']?.trim();
  const engineEl = doc.getElementById('orz-engine');
  const engine = engineEl && engineEl.tagName === 'SCRIPT' && !engineEl.hasAttribute('src') ? engineEl.textContent : null;
  const includes = shellIncludes(doc);
  return {
    text,
    ...(uid && UID_PATTERN.test(uid) ? { uid } : {}),
    format: f && /^[1-9][0-9]*$/.test(f) ? Number(f) : 1,
    delivery: shellDelivery(doc),
    ...(includes ? { includes } : {}),
    engine: engine || null,
    fileName: openedFileName(doc.defaultView?.location, kind),
  };
}
