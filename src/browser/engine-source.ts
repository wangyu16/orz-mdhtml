/**
 * KIND-INDEPENDENT: the exact text of this browser bundle, which an inline
 * assembly (FC-19 §2 `engineSource`) writes into `<script id="orz-engine">`.
 *
 * - Inline (an inline-delivery file, the update sandbox): the bundle's own
 *   `<script>` text, captured when the bundle starts (`captureOwnScript`).
 * - Loaded by URL (a cdn-delivery file, an app's `<script src>`): fetched
 *   once from that URL, else from this release's jsDelivr URL — the same
 *   bytes — and required to be script-safe (the bundle rule).
 * - ESM (an app bundled it): fetched from this release's jsDelivr URL.
 */
import { isScriptSafe } from 'orz-markdown/carrier/shell';

let inlineText: string | null = null;
let ownUrl: string | null = null;
let fetched: Promise<string> | null = null;

/** Record the running bundle's own script (call once, synchronously, when the bundle starts). */
export function captureOwnScript(): void {
  try {
    const s = typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null) : null;
    if (!s) return;
    if (s.src) ownUrl = s.src;
    else if (s.textContent) inlineText = s.textContent;
  } catch { /* no document (a worker) */ }
}

/** The bundle text when it runs inline (synchronously known), else null. */
export function inlineEngineSource(): string | null {
  return inlineText;
}

/**
 * The bundle's exact text: inline at once, else fetched (from the URL it was
 * loaded from, else `fallbackUrl`). Rejects when it cannot be had or is not
 * script-safe.
 */
export function engineSource(fallbackUrl: string): Promise<string> {
  if (inlineText !== null) return Promise.resolve(inlineText);
  fetched ??= (async () => {
    const urls = [...new Set([ownUrl, fallbackUrl].filter((u): u is string => !!u))];
    let last: unknown = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const text = await res.text();
        if (!isScriptSafe(text)) throw new Error(`the engine at ${url} is not script-safe`);
        return text;
      } catch (e) {
        last = e;
      }
    }
    throw new Error(`orz-mdhtml: the engine source for an inline file could not be loaded (${last instanceof Error ? last.message : String(last)}); pass options.engineSource or assemble with delivery "cdn"`);
  })();
  fetched.catch(() => { fetched = null; });
  return fetched;
}
