/**
 * Real-Chrome test environment for the browser bundle (steps 3–4): the
 * bundle built in memory (build/bundle.ts), assembled files on disk (opened
 * over `file:` and over a local http server), jsDelivr routed to local files
 * (this bundle, release.json, orz-markdown's themes and CodeMirror 6, KaTeX's
 * CSS), every other external URL refused (offline), page errors recorded,
 * and the File System Access picker replaced by one that returns REAL
 * handles from the origin-private file system (as orz-markdown's conformance
 * harness does), so IndexedDB, permissions, reads and writes are real.
 */
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';
import { buildBrowser, type BrowserBuild } from '../build/bundle.js';
import { assemble, type AssembleOptions } from '../src/assemble.js';

type PW = typeof import('playwright-core');
export type Browser = import('playwright-core').Browser;
export type BrowserContext = import('playwright-core').BrowserContext;
export type Page = import('playwright-core').Page;

const builds = new Map<string, Promise<BrowserBuild>>();
/** The browser bundle of this package (or of another version), built once per test file. */
export function bundle(version?: string): Promise<BrowserBuild> {
  const key = version ?? '';
  let b = builds.get(key);
  if (!b) { b = buildBrowser(version ? { version } : {}); builds.set(key, b); }
  return b;
}

/** Assemble with the real bundle as the engine. */
export async function assembleReal(text: string, o: AssembleOptions = {}): Promise<string> {
  const b = await bundle();
  return assemble(text, (o.delivery ?? 'inline') === 'inline' && o.engineSource === undefined ? { ...o, engineSource: b.iife } : o);
}

/** Real Chrome (file access for the OPFS picker on file: pages), or null. */
export async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = (await import('playwright-core')) as PW;
    return await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
  } catch {
    return null;
  }
}

/** A temporary folder for assembled files. */
export function tempDir(prefix = 'orz-mdhtml-test-'): { dir: string; write(name: string, data: string): string; read(name: string): string; clean(): void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    write(name, data) { const p = join(dir, name); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data, 'utf8'); return p; },
    read(name) { return readFileSync(join(dir, name), 'utf8'); },
    clean() { rmSync(dir, { recursive: true, force: true }); },
  };
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

/** A static server for a folder (and extra routes), on 127.0.0.1. */
export async function serve(root: string, extra: Record<string, { body: string; type?: string; headers?: Record<string, string> }> = {}): Promise<{ url: string; close(): Promise<void>; server: Server }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const x = extra[path];
    if (x) { res.writeHead(200, { 'content-type': x.type ?? TYPES[extname(path)] ?? 'text/plain', ...(x.headers ?? {}) }); res.end(x.body); return; }
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, server, close: () => new Promise((r) => server.close(() => r())) };
}

const NM = join(process.cwd(), 'node_modules');

export interface RouteOptions {
  /** The manifest served at `orz-mdhtml-browser@latest/release.json` (none: 404, no update offered). */
  latest?: { release: string; bundle: string; version: string } | null;
  /** Count requests here. */
  log?: string[];
}

/**
 * Route jsDelivr to local files: this package's bundle at its version (and a
 * `latest` release when given), orz-markdown's themes and CodeMirror 6 at its
 * version, KaTeX's stylesheet and fonts. Everything else external fails.
 */
export async function routeCdn(ctx: BrowserContext, o: RouteOptions = {}): Promise<void> {
  const b = await bundle();
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
    const url = route.request().url();
    o.log?.push(url);
    const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/([^@/]+)@([^/]+)\/(.+)$/.exec(url);
    const ok = (body: string | Buffer, type: string) => route.fulfill({ status: 200, body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
    if (m) {
      const [, pkg, ver, path] = m;
      if (pkg === 'orz-mdhtml-browser') {
        if (ver === b.version && path === 'orz-mdhtml.browser.js') return ok(b.iife, 'text/javascript; charset=utf-8');
        if (o.latest && ver === 'latest' && path === 'release.json') return ok(o.latest.release, 'application/json');
        if (o.latest && ver === o.latest.version && path === 'orz-mdhtml.browser.js') return ok(o.latest.bundle, 'text/javascript; charset=utf-8');
        return route.fulfill({ status: 404, body: 'not found' });
      }
      if (pkg === 'orz-markdown' && ver === ORZ_MARKDOWN_VERSION) {
        const file = join(NM, 'orz-markdown', path);
        if (existsSync(file)) return ok(readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
      }
      if (pkg === 'katex') {
        const file = join(NM, 'katex', path);
        if (existsSync(file)) return ok(readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
      }
    }
    return route.abort('internetdisconnected');
  });
}

/** The origin-private folder the OPFS picker uses for a page path (one per page). */
const OPFS_FOLDER = `function (p) { var h = 5381; for (var i = 0; i < p.length; i++) h = ((h * 33) ^ p.charCodeAt(i)) >>> 0; return 'orz-test-' + h.toString(36); }`;

/**
 * Init script: the picker returns real OPFS handles in the page's own folder
 * (or `window.__orzPickIn = { folder, name }` once), recorded in
 * `window.__orzPicks`; downloads and page errors are recorded too.
 */
export const PICKER_INIT = `(() => {
  var folder = ${OPFS_FOLDER};
  window.__orzPicks = [];
  window.__orzErrors = [];
  window.addEventListener('error', function (e) { window.__orzErrors.push(String(e && e.message)); });
  window.addEventListener('unhandledrejection', function (e) { window.__orzErrors.push('unhandled: ' + String(e && e.reason && (e.reason.message || e.reason))); });
  var pick = function (opts) {
    var name = (opts && opts.suggestedName) || 'picked.html';
    var pin = window.__orzPickIn; window.__orzPickIn = undefined;
    var dir = pin && pin.folder ? String(pin.folder) : folder(String(location.pathname));
    if (pin && pin.name) name = String(pin.name);
    window.__orzPicks.push({ suggestedName: opts && opts.suggestedName, folder: dir, name: name });
    return navigator.storage.getDirectory()
      .then(function (r) { return r.getDirectoryHandle(dir, { create: true }); })
      .then(function (d) { return d.getFileHandle(name, { create: true }); });
  };
  try { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, writable: true, value: pick }); } catch (e) {}
})();`;

/** Page-side: the text of a file the OPFS picker made (null when none). */
export async function readOpfs(page: Page, name: string, folderOf?: string): Promise<string | null> {
  return page.evaluate(async ({ name, folderOf, fn }) => {
    // eslint-disable-next-line no-new-func
    const folder = new Function(`return (${fn})`)() as (p: string) => string;
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(folderOf ? folder(folderOf) : folder(location.pathname));
      return await (await (await dir.getFileHandle(name)).getFile()).text();
    } catch { return null; }
  }, { name, folderOf, fn: OPFS_FOLDER });
}

/** Page-side: put the opened file "on disk" in its OPFS folder (as the picker finds it). */
export async function writeOpfs(page: Page, name: string, data: string): Promise<void> {
  await page.evaluate(async ({ name, data, fn }) => {
    const folder = new Function(`return (${fn})`)() as (p: string) => string;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder(location.pathname), { create: true });
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(data);
    await w.close();
  }, { name, data, fn: OPFS_FOLDER });
}

/** Collect page errors (uncaught) for a page. */
export function recordErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  return errors;
}

/** Wait until the booted file's read view is in the page. */
export async function bootDone(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(globalThis as { OrzCarrier?: { standalone?: unknown } }).OrzCarrier?.standalone);
  await page.evaluate(() => (globalThis as unknown as { OrzCarrier: { standalone: { ready: Promise<void> } } }).OrzCarrier.standalone.ready);
}
