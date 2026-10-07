/**
 * The IIFE entry of `orz-mdhtml-browser` (`orz-mdhtml.browser.js`). First its
 * own script text is captured (`captureEngineSource`: an inline file's — or
 * the update sandbox's — exact bundle, which an inline assembly writes back);
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
import { useEngineSource } from './carrier.js';
import { MD_KIND } from './md/kind.js';

useEngineSource(captureEngineSource());
startCarrier(MD_KIND);
