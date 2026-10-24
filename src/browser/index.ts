/**
 * The IIFE entry of `orz-mdhtml-browser` (`orz-mdhtml.browser.js`). First its
 * own script text is captured (`captureEngineSource`, only this carrier's
 * bundle: an inline file's `#orz-engine` — or the update sandbox's — exact
 * bundle, which an inline assembly writes back; a script loaded by URL as
 * `orz-mdhtml.browser.js`);
 * then the kit's `startCarrier` sets the standard bundle global
 * `globalThis.OrzCarrier` (FC-19 §2) and, when it runs inside an assembled
 * `.md.html` (an `#orz-src` island is present), boots the standalone file
 * (orz-markdown `carrier/app`: read view, chrome, edit mode, saves, host,
 * quiet update).
 *
 * In the quiet update's sandbox and in an app's page there is no island: only
 * the global is set, nothing else is touched (no storage, no network, no DOM).
 */
import { captureEngineSource, startCarrier } from 'orz-markdown/carrier/app';
import { BUNDLE_FILE } from '../assemble.js';
import { includeTargets, linkTargets, upgrade, useEngineSource } from './carrier.js';
import { MD_KIND } from './md/kind.js';

// Only this carrier's bundle is the engine (orz-markdown A.12): a script loaded as `orz-mdhtml.browser.js`,
// the file's `#orz-engine` or the update sandbox's bundle — never an app script that bundles this IIFE (the
// release's jsDelivr URL is fetched instead). No `integrity`: the bundle cannot carry the hash of its own bytes
// (release.json is computed from them after the build); the inline text is the file's `#orz-engine` or the
// sandbox's verified bundle (U.6), which the update already checked against the release's integrity.
useEngineSource(captureEngineSource(undefined, { bundle: BUNDLE_FILE }));
const { carrier } = startCarrier(MD_KIND);
// orz-mdhtml's extensions of the FC-19 global: upgrade an old file in the browser (STATUS D-111), and the
// targets a text points at (the kit's browser-safe includeTargets / linkTargets, 2.5.0)
try { Object.assign(carrier as unknown as Record<string, unknown>, { upgrade, includeTargets, linkTargets }); } catch { /* a frozen global */ }
