/**
 * KIND-INDEPENDENT: the standalone startup of an assembled file (REBUILD
 * §3a; the seam is `StandaloneKind`, ./types.ts). On load it reads the
 * opened file (./file.ts), renders the carrier's read view in the page and
 * mounts the chrome in a shadow root: Edit, the carrier's header settings
 * (md: theme, measure), Save, and a menu with Download a copy, New document
 * and Save as new copy; the quiet update indicator next to the brand.
 *
 * - **The text is the document.** The page holds the current text and the
 *   last saved text; every save writes `assemble(currentText, { delivery of
 *   the file, its includes })` — never the live DOM (spec/shell-runtime.md §0).
 * - **Header settings** write the header: in edit mode through the editor's
 *   `setHeader` (one undoable edit), outside it through the kit's
 *   `editHeader` on the current text (undoable with Cmd/Ctrl+Z). Both mark
 *   the document unsaved.
 * - **Edit mode** mounts the carrier's editor (the kit's editor shell, FC-19)
 *   with the file's saver, host, includes and opened bytes; leaving it keeps
 *   its text and re-renders the read view. View mode, split and scroll sync
 *   are the kit's reader preferences by `uid` — never in the document.
 * - **Host** (framed): `connectHost` (file side, all three protocols): saves
 *   go to the host, AI operations become the editor's AI hook, includes are
 *   resolved by the host for the read view and the preview.
 * - **Leaving with unsaved changes** (top-level files): `beforeunload` asks
 *   (the browser's own prompt); never for the update's reload.
 * - **Quiet update** (top-level files only, the kit's who-checks rule):
 *   `checkForUpdate` → `mountUpdateIndicator` → `performUpdate`; the editor
 *   is read-only while it runs; the page reloads only when the kit says so.
 */
import { editHeader, mintUid, readDocument, type HeaderChange } from 'orz-markdown/carrier';
import type { EditorShell } from 'orz-markdown/carrier/editor';
import {
  checkForUpdate, connectHost, createSaver, createShadowRoot, KIND_EXTENSIONS, mountUpdateIndicator, performUpdate, showToast, skipVersion,
  type HostConnection, type SaveResult, type ShadowRootLike, type UiElement, type UpdateInfo,
} from 'orz-markdown/carrier/shell';
import { button, installCss, menuButton, settingPicker, WIDGET_CSS, type MenuButton } from '../ui/widgets.js';
import { copyName, readOpenedFile, type OpenedFile } from './file.js';
import type { StandaloneContext, StandaloneKind } from './types.js';

/** The chrome's own layout (the bar, the edit overlay), next to `CHROME_CSS` and the widgets' CSS. */
export const APP_CSS = `
:host { position: fixed; top: 12px; right: 12px; z-index: 2147481000; display: block; }
:host([data-mode="edit"]) { inset: 0; display: flex; flex-direction: column; background: var(--orz-chrome-bg); }
.orz-app__bar {
  display: flex; align-items: center; gap: var(--orz-chrome-space-2); padding: var(--orz-chrome-space-2);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-l);
  background: var(--orz-chrome-surface); box-shadow: var(--orz-chrome-shadow);
}
/* no transform, filter or backdrop-filter here: they would trap the kit's fixed popovers and toasts */
:host([data-mode="edit"]) .orz-app__bar { border-width: 0 0 1px; border-radius: 0; box-shadow: none; padding: var(--orz-chrome-space-2) var(--orz-chrome-space-4); background: var(--orz-chrome-surface); }
.orz-app__brand { padding: 0 var(--orz-chrome-space-2); color: var(--orz-chrome-muted); font: 700 var(--orz-chrome-text-md)/1 var(--orz-chrome-font); letter-spacing: .02em; }
.orz-app__title { display: none; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--orz-chrome-muted); }
:host([data-mode="edit"]) .orz-app__title { display: block; }
:host([data-mode="edit"]) .orz-app__read-only { display: none; }
:host(:not([data-mode="edit"])) .orz-app__edit-only { display: none; }
.orz-app__save { position: relative; }
.orz-app__save[data-dirty="true"]::after {
  content: ""; position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 50%;
  background: var(--orz-chrome-accent); box-shadow: 0 0 0 2px var(--orz-chrome-surface);
}
.orz-app__editor { flex: 1; min-height: 0; display: flex; }
.orz-app__editor > * { flex: 1; min-width: 0; }
@media (max-width: 560px) { .orz-btn__label { display: none; } .orz-btn { padding: 0 var(--orz-chrome-space-3); } }
`;

/** The page-side handle of a booted file (`OrzCarrier.standalone`; tests and the conformance driver use it). */
export interface StandaloneApp {
  readonly file: Readonly<OpenedFile>;
  /** The current text (the editor's while editing). */
  getText(): string;
  isDirty(): boolean;
  /** Enter edit mode (mounting the editor once) and return the editor. */
  edit(): EditorShell;
  /** Leave edit mode (the read view shows the current text). */
  leave(): Promise<void>;
  /** The editor while editing, else null. */
  editor(): EditorShell | null;
  /** Write header settings (as the pickers do). */
  setSetting(changes: Record<string, HeaderChange>): void;
  /** Undo the last header setting made outside edit mode. */
  undo(): boolean;
  save(): Promise<unknown>;
  download(): Promise<SaveResult>;
  newDocument(): Promise<SaveResult>;
  saveAsCopy(): Promise<SaveResult>;
  /** The context the file gives an editor mounted on it (`OrzCarrier.mountEditor` without `hooks.save`). */
  editorContext(): StandaloneContext;
  /**
   * Register an editor mounted on this file's context (it saves through the file's saver): while
   * one is attached, the page's own shortcuts defer to it — Cmd/Ctrl+S saves that editor, never
   * the page's other copy of the text — and its unsaved changes count for leaving the page.
   * Returns the detach function (call it when the editor is destroyed).
   */
  attach(editor: EditorShell): () => void;
  /** The chrome's shadow root. */
  readonly root: ShadowRoot;
  readonly host: HostConnection | undefined;
  /** Resolves when the first read view is in the page. */
  readonly ready: Promise<void>;
}

const isMac = (win: Window): boolean => /Mac|iPhone|iPad/.test(win.navigator?.platform ?? '');

/** Boot the standalone file in `win` (null when the page is not an assembled file of this kind). */
export function bootStandalone(k: StandaloneKind, win: Window = window): StandaloneApp | null {
  const doc = win.document;
  const opened = readOpenedFile(doc, k.kind);
  if (!opened) return null;
  const file: OpenedFile = opened;
  const ext = KIND_EXTENSIONS[k.kind];
  const maxFormat = Math.max(...k.formats);

  // ── document state: the text is the document ──
  let text = file.text;
  let saved = file.text;
  let editor: EditorShell | null = null;
  let updating = false;
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  const currentText = (): string => (editor ? editor.getText() : text);
  const isDirty = (): boolean => (editor ? editor.isDirty() : text !== saved);
  /** Editors mounted on this file's context through `OrzCarrier.mountEditor` (not the Edit button's). */
  const attached: EditorShell[] = [];
  const attach = (ed: EditorShell): (() => void) => {
    attached.push(ed);
    return () => { const i = attached.indexOf(ed); if (i >= 0) attached.splice(i, 1); };
  };

  // ── the file's own assembly: its delivery and includes (FC-19 §8.5); the opened bytes (content proof) ──
  const engineSource = file.engine ?? undefined;
  const assembleFile = (t: string, o?: { includes?: Record<string, string> }): Promise<string> =>
    k.assemble(t, { delivery: file.delivery, ...(engineSource ? { engineSource } : {}), ...(o?.includes ? { includes: o.includes } : {}) });
  let openedBytes: Promise<string> | null = null;
  const openedHtml = (): Promise<string> => (openedBytes ??= assembleFile(file.text, file.includes ? { includes: file.includes } : undefined));
  {
    // computed when the page is first idle, so a save click does not wait for it (B#6)
    const warm = (): void => { void openedHtml().catch(() => undefined); };
    const idle = (win as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (typeof idle === 'function') idle.call(win, warm, { timeout: 2000 }); else win.setTimeout(warm, 300);
  }

  // ── host (framed only: an unframed page never listens) ──
  const framed = win.parent !== win;
  let refreshAi = (): void => undefined;
  let rerender = (): void => undefined;
  const host: HostConnection | undefined = framed
    ? connectHost({
      kind: k.kind,
      ai: { onOperations() { refreshAi(); } },
      include: { onAvailable() { rerender(); } },
    })
    : undefined;
  const hostAi: StandaloneContext['ai'] = host && {
    get operations() { return host.aiOperations(); },
    async request(op, c) {
      const passage = c.selection ? c.text.slice(c.selection.from, c.selection.to) : c.text;
      const r = await host.requestAi(op, passage, !!c.selection);
      if (r.ok !== true || typeof r.proposed !== 'string') throw new Error(r.error ?? 'The host could not run that.');
      return { proposed: r.proposed };
    },
  };
  const hostInclude = host
    ? (url: string): Promise<string | null> => (host.protocols().include ? host.requestInclude(url) : Promise.resolve(null))
    : undefined;

  const saver = createSaver({ ...(file.uid ? { uid: file.uid } : {}), suggestedName: file.fileName, kind: k.kind, ...(host ? { host } : {}), openedHtml });

  const editorContext = (): StandaloneContext => ({
    fileName: file.fileName,
    assemble: assembleFile,
    saver,
    ...(host ? { host } : {}),
    ...(file.includes ? { includes: file.includes } : {}),
    openedHtml,
    standalone: !host,
    ...(hostAi ? { ai: hostAi } : {}),
    ...(hostInclude ? { fetchInclude: hostInclude } : {}),
  });

  // ── read view ──
  const view = k.createReadView(doc);
  const viewMain = doc.getElementById('orz-view');
  const renderView = (): Promise<void> => view.render(currentText(), { ...(file.includes ? { includes: file.includes } : {}), ...(hostInclude ? { fetchInclude: hostInclude } : {}) });
  rerender = () => { if (!editor) void renderView(); else void editor.refreshPreview(); };
  const ready = renderView().then(() => {
    // a fragment in the address goes to its heading once the content exists
    const id = (() => { try { return decodeURIComponent(win.location.hash.slice(1)); } catch { return ''; } })();
    if (id) doc.getElementById(id)?.scrollIntoView();
  }, () => undefined);

  // ── chrome: one shadow root on the shell's mount point ──
  let mount = doc.getElementById('orz-chrome');
  if (!mount) {
    mount = doc.createElement('div');
    mount.id = 'orz-chrome';
    doc.body.append(mount);
  }
  mount.setAttribute('data-orz-chrome', 'app');
  const root = createShadowRoot(mount as unknown as UiElement) as unknown as ShadowRoot;
  installCss(root, WIDGET_CSS);
  installCss(root, APP_CSS);
  const toast = (message: string, tone: 'info' | 'success' | 'warning' | 'error' = 'info'): void => {
    showToast(root as unknown as ShadowRootLike, message, { tone });
  };
  const setScheme = (scheme: 'light' | 'dark'): void => { mount!.setAttribute('data-chrome', scheme); };
  setScheme(view.present(text).theme.scheme);

  const bar = doc.createElement('div');
  bar.className = 'orz-app__bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Document');
  const brand = doc.createElement('span');
  brand.className = 'orz-app__brand';
  brand.id = 'orz-brand';
  brand.tabIndex = -1;
  brand.textContent = 'orz';
  const title = doc.createElement('span');
  title.className = 'orz-app__title';
  const editBtn = button(doc, { label: 'Edit', icon: 'edit', variant: 'primary' });
  editBtn.classList.add('orz-app__read-only');
  const doneBtn = button(doc, { label: 'Done', icon: 'preview' });
  doneBtn.classList.add('orz-app__edit-only');
  doneBtn.title = 'Back to the read view';
  const saveBtn = button(doc, { label: 'Save', icon: 'save' });
  saveBtn.classList.add('orz-app__save', 'orz-app__read-only');
  bar.append(brand, title, editBtn);

  const pickers: MenuButton[] = [];
  for (const control of k.settings) {
    const p = settingPicker(doc, control, currentText, (key, value) => setSetting({ [key]: value }));
    p.element.classList.add('orz-app__read-only');
    pickers.push(p);
    bar.append(p.element);
  }
  const more = menuButton(doc, {
    label: 'More',
    icon: 'more',
    iconOnly: true,
    items: () => [
      { label: 'Download a copy', run: () => { void download(); } },
      { label: 'New document', separator: true, run: () => { void newDocument(); } },
      { label: 'Save as new copy', run: () => { void saveAsCopy(); } },
    ],
  });
  bar.append(saveBtn, doneBtn, more.element);
  const editorSlot = doc.createElement('div');
  editorSlot.className = 'orz-app__editor';
  editorSlot.hidden = true;
  root.append(bar, editorSlot);

  // ── dirty state outside the editor (the editor reports its own, also to the host) ──
  let lastDirty = false;
  const dirtyChanged = (): void => {
    const d = isDirty();
    saveBtn.setAttribute('data-dirty', String(d));
    saveBtn.setAttribute('aria-label', d ? 'Save (unsaved changes)' : 'Save');
    if (d !== lastDirty) {
      lastDirty = d;
      if (!editor) host?.setDirty(d);
    }
  };
  dirtyChanged();

  const afterHeaderChange = (): void => {
    setScheme(view.present(currentText()).theme.scheme);
    dirtyChanged();
  };

  function setSetting(changes: Record<string, HeaderChange>): void {
    if (updating) { toast('An update is running; try again when it is done.', 'warning'); return; }
    try {
      if (editor) {
        editor.setHeader(changes); // one undoable edit in the editor; the read view follows
      } else {
        const next = editHeader(text, changes);
        if (next === text) return;
        undoStack.push(text);
        redoStack.length = 0;
        text = next;
      }
    } catch (e) {
      toast(`Could not change the header: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return;
    }
    afterHeaderChange();
  }

  function undo(): boolean {
    if (editor || updating || undoStack.length === 0) return false;
    redoStack.push(text);
    text = undoStack.pop()!;
    afterHeaderChange();
    return true;
  }
  function redo(): boolean {
    if (editor || updating || redoStack.length === 0) return false;
    undoStack.push(text);
    text = redoStack.pop()!;
    afterHeaderChange();
    return true;
  }

  // ── saving (never the live DOM: always the assembly of the current text) ──
  async function save(): Promise<unknown> {
    if (editor) return editor.save();
    if (updating) return { ok: false, error: 'updating' };
    const t = text;
    if (readDocument(t, { kind: k.kind }).format > maxFormat) {
      toast('This document uses a newer text format; it is shown read-only and cannot be saved here.', 'warning');
      return { ok: false, error: 'format' };
    }
    let html: string;
    try { html = await assembleFile(t, file.includes ? { includes: file.includes } : undefined); } catch (e) {
      toast(`Could not save: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return { ok: false, error: String(e) };
    }
    const r = await saver.save({ text: t, html });
    if (r.via === 'served-notice') {
      toast('This page is served from the web, so it cannot be saved in place. Use “Download a copy” (⋯) to keep your changes.', 'warning');
      return r;
    }
    if (r.ok) {
      saved = t;
      dirtyChanged();
      toast(r.via === 'download' ? 'Download started.' : 'Saved.', 'success');
    } else if (!(r.via === 'file' && r.error === 'cancelled')) {
      toast(`Could not save: ${r.error ?? 'unknown error'}`, 'error');
    }
    return r;
  }

  async function download(): Promise<SaveResult> {
    const t = currentText();
    let html: string;
    try { html = await assembleFile(t, file.includes ? { includes: file.includes } : undefined); } catch (e) {
      toast(`Could not download: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return { via: 'download', ok: false, error: String(e), confirmed: false };
    }
    const r = await saver.download({ html });
    toast(r.via === 'download' && r.ok ? 'Download started.' : 'The download failed.', r.via === 'download' && r.ok ? 'success' : 'error');
    return r;
  }

  /** Save a new file (new uid) through the picker — never over this file, never to the host. */
  async function saveNewFile(t: string, name: string, what: string): Promise<SaveResult> {
    let html: string;
    try {
      html = await k.assemble(t, { delivery: file.delivery, ...(engineSource ? { engineSource } : {}), ...(what === 'copy' && file.includes ? { includes: file.includes } : {}) });
    } catch (e) {
      toast(`Could not create the file: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return { via: 'download', ok: false, error: String(e), confirmed: false };
    }
    const uid = readDocument(t, { kind: k.kind }).meta.uid;
    const s = createSaver({ ...(uid ? { uid } : {}), suggestedName: name, kind: k.kind });
    let r = await s.save({ text: t, html });
    if (r.via === 'served-notice' || r.via === 'host') r = await s.download({ html });
    if (r.via === 'file' && r.ok) toast(`${what === 'copy' ? 'Saved a new copy' : 'Created a new document'}${r.name ? `: ${r.name}` : ''}.`, 'success');
    else if (r.via === 'download' && r.ok) toast(`${what === 'copy' ? 'A new copy' : 'A new document'} is downloading.`, 'success');
    else if (!(r.via === 'file' && r.error === 'cancelled')) toast(`Could not save the file: ${'error' in r && r.error ? r.error : 'unknown error'}`, 'error');
    return r;
  }

  function newDocument(): Promise<SaveResult> {
    return saveNewFile(k.newDocument(), `Untitled${ext}`, 'new');
  }

  function saveAsCopy(): Promise<SaveResult> {
    let t: string;
    try { t = editHeader(currentText(), { uid: mintUid() }); } catch (e) {
      toast(`Could not copy: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return Promise.resolve({ via: 'download', ok: false, error: String(e), confirmed: false });
    }
    return saveNewFile(t, copyName(file.fileName, k.kind), 'copy');
  }

  // ── edit mode ──
  let offEditor: Array<() => void> = [];
  function edit(): EditorShell {
    if (editor) return editor;
    mount!.setAttribute('data-mode', 'edit');
    editorSlot.hidden = false;
    if (viewMain) viewMain.hidden = true;
    doc.documentElement.style.overflow = 'hidden';
    const container = doc.createElement('div');
    editorSlot.append(container);
    // mounted with the saved text, then the current one: the editor's dirty state and undo know both
    const ed = k.mountEditor(container, { text: saved }, editorContext());
    if (text !== saved) ed.setText(text);
    if (updating) ed.setReadOnly(true);
    editor = ed;
    title.textContent = doc.title;
    offEditor = [
      ed.on('save', (e) => { saved = e.text; dirtyChanged(); }),
      ed.on('dirty', () => dirtyChanged()),
      ed.on('change', () => { headerFollow(); }),
    ];
    dirtyChanged();
    ed.focus();
    return ed;
  }
  let headerTimer: number | null = null;
  const headerFollow = (): void => {
    if (headerTimer !== null) win.clearTimeout(headerTimer);
    headerTimer = win.setTimeout(() => { headerTimer = null; setScheme(view.present(currentText()).theme.scheme); }, 200);
  };

  async function leave(): Promise<void> {
    const ed = editor;
    if (!ed) return;
    text = ed.getText();
    if (!ed.isDirty()) saved = text;
    for (const off of offEditor) off();
    offEditor = [];
    editor = null;
    ed.destroy();
    editorSlot.replaceChildren();
    editorSlot.hidden = true;
    mount!.removeAttribute('data-mode');
    if (viewMain) viewMain.hidden = false;
    doc.documentElement.style.overflow = '';
    undoStack.length = 0;
    redoStack.length = 0;
    lastDirty = !isDirty(); // re-post the state outside the editor
    dirtyChanged();
    await renderView();
    editBtn.focus();
  }

  refreshAi = () => { if (editor) k.refreshEditorTools?.(editor); };

  editBtn.addEventListener('click', () => { edit(); });
  doneBtn.addEventListener('click', () => { void leave(); });
  saveBtn.addEventListener('click', () => { void save(); });

  // keyboard outside the editor: Cmd/Ctrl+S saves, Cmd/Ctrl+Z / Shift+Z undo / redo header settings, Cmd/Ctrl+E edits
  win.addEventListener('keydown', (e) => {
    // the file's editor has its own keymap; a key another editor on the page (OrzCarrier.mountEditor)
    // or any other handler already took is not ours either — never save this file for it
    if (editor || e.defaultPrevented) return;
    const mod = isMac(win) ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey) return;
    const target = e.composedPath()[0] as HTMLElement | undefined;
    const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? ''));
    const key = e.key.toLowerCase();
    // an editor mounted on this file (its focus elsewhere, e.g. a read-only one) is the document being edited
    const other = attached[attached.length - 1];
    if (key === 's') { e.preventDefault(); void (other ? other.save() : save()); }
    else if (other) return;
    else if (key === 'e' && !typing) { e.preventDefault(); edit(); }
    else if (key === 'z' && !typing) { if (e.shiftKey ? redo() : undo()) e.preventDefault(); }
  });

  // ── data-loss protection: leaving a top-level file with unsaved changes asks first ──
  // (the browser's own "Leave site?" prompt; a framed file's host owns that decision, it is told
  // the dirty state through orz-host-save@1). The quiet update's reload never asks: the kit
  // reloads only after the update wrote the current text into the opened file.
  let leavingForUpdate = false;
  if (!framed) {
    win.addEventListener('beforeunload', (e) => {
      if (leavingForUpdate || !(isDirty() || attached.some((ed) => ed.isDirty()))) return;
      e.preventDefault();
      e.returnValue = ''; // Chromium before 119 asks only when returnValue is set
    });
  }

  // ── the quiet update (FD-05): only a top-level standalone file checks (the kit's guards) ──
  async function runUpdate(info: UpdateInfo): Promise<void> {
    if (updating) return;
    updating = true;
    const ed = editor;
    const wasReadOnly = ed ? ed.isReadOnly() : true;
    ed?.setReadOnly(true);
    for (const p of pickers) p.button.disabled = true;
    let reloading = false;
    try {
      const r = await performUpdate({
        info, kind: k.kind, current: k.version, getText: currentText, saver, delivery: file.delivery,
        ...(file.includes ? { includes: file.includes } : {}), openedName: file.fileName,
      });
      if (r.status === 'up-to-date') return;
      if (r.status === 'failed') throw new Error(r.error);
      if (r.save.via === 'served-notice') {
        const d = await saver.download({ html: r.html });
        if (!('ok' in d) || !d.ok) throw new Error('The updated file could not be downloaded.');
        toast(`The file updated to ${info.latest} is downloading; this page stays as it is.`, 'success');
        return;
      }
      if (!r.save.ok) throw new Error(r.save.error ?? 'The updated file could not be saved.');
      if (r.reload) {
        reloading = true;
        leavingForUpdate = true;
        saved = r.text;
        win.location.reload();
        return;
      }
      toast(`Updated to ${info.latest} and saved${'name' in r.save && r.save.name ? ` as ${r.save.name}` : ''}; this page keeps the version it was opened with.`, 'success');
    } finally {
      if (!reloading) {
        updating = false;
        for (const p of pickers) p.button.disabled = false;
        if (ed && editor === ed && !wasReadOnly) ed.setReadOnly(false);
      }
    }
  }

  if (!framed) {
    const docFormat = file.format;
    void checkForUpdate({ kind: k.kind, current: k.version, format: docFormat, ...(host ? { host } : {}) }).then((info) => {
      if (!info) return;
      mountUpdateIndicator(brand as unknown as UiElement, info, {
        onUpdate: (i) => runUpdate(i),
        onSkip: (i) => { skipVersion(i.kind, i.latest); },
      });
    }, () => undefined);
  }

  return {
    file,
    getText: currentText,
    isDirty,
    edit,
    leave,
    editor: () => editor,
    setSetting,
    undo,
    save,
    download,
    newDocument,
    saveAsCopy,
    editorContext,
    attach,
    root,
    host,
    ready,
  };
}
