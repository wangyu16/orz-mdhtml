/**
 * The IIFE entry of `orz-mdhtml-browser` (`orz-mdhtml.browser.js`): sets the
 * standard bundle global `globalThis.OrzCarrier` (FC-19 §2) and, when it runs
 * inside an assembled `.md.html` (an `#orz-src` island is present), boots the
 * standalone file (read view, chrome, edit mode, saves, host, quiet update).
 *
 * In the quiet update's sandbox (spec/shell-runtime.md §7.2) and in an app's
 * page there is no island: only the global is set, nothing else is touched (no
 * storage, no network, no DOM).
 */
import { captureOwnScript } from './engine-source.js';
import * as api from './carrier.js';
import { MD_KIND } from './md/kind.js';
import { bootStandalone, type StandaloneApp } from './standalone/app.js';

captureOwnScript();

let app: StandaloneApp | null = null;

const OrzCarrier = {
  kind: api.kind,
  version: api.version,
  formats: api.formats,
  assemble: api.assemble,
  extract: api.extract,
  readDocument: api.readDocument,
  /**
   * FC-19 `mountEditor`. Without `hooks.save`, in an assembled file, the
   * editor saves through the file's own saver, host connection, delivery and
   * includes (FC-19 §4: a carrier never opens a second host connection), and
   * the file's keyboard save (Cmd/Ctrl+S on the page) saves that editor.
   */
  mountEditor: (element: HTMLElement, options: api.EditorOptions): api.Editor => {
    const file = app && !options?.hooks?.save ? app : null;
    const editor = api.mountEditor(element, options, file ? file.editorContext() : undefined);
    if (file) {
      // an editor of this file: the page's shortcuts and its leave warning defer to it until it is destroyed
      const detach = file.attach(editor);
      const destroy = editor.destroy.bind(editor);
      editor.destroy = () => { detach(); destroy(); };
    }
    return editor;
  },
  renderPreview: api.renderPreview,
  /** The booted file's handle (null outside an assembled file). Not part of FC-19: tests and the conformance driver use it. */
  get standalone(): StandaloneApp | null { return app; },
};

(globalThis as Record<string, unknown>).OrzCarrier = OrzCarrier;

if (typeof document !== 'undefined') {
  try {
    app = bootStandalone(MD_KIND, window);
  } catch (e) {
    // a file that cannot boot still shows its island's text nowhere else: say so in the console only
    try { console.error('orz-mdhtml: the file could not start', e); } catch { /* no console */ }
  }
}
