/**
 * Browser entry for the orz-markdown renderer.
 *
 * esbuild bundles this (with orz-markdown + its deps) into a single IIFE,
 * `dist/orzmd.browser.js`, which exposes `window.orzmd.render(src)`.
 *
 * Two consumers:
 *   1. `--inline` generation embeds this bundle directly in each .md.html.
 *   2. `--cdn` generation references a published copy on jsDelivr
 *      (package `orz-mdhtml-browser`) so files stay small and the bundle
 *      is browser-cached across documents.
 */
import { md } from 'orz-markdown';

declare global {
  interface Window {
    orzmd: {
      version: string;
      render: (source: string) => string;
    };
  }
}

// Version is injected at bundle time via esbuild `define`.
declare const __ORZMD_VERSION__: string;

window.orzmd = {
  version: typeof __ORZMD_VERSION__ !== 'undefined' ? __ORZMD_VERSION__ : '0.0.0',
  render(source: string): string {
    // markdownBasePath is omitted: filesystem includes don't resolve in-browser.
    return md.render(source);
  },
};
