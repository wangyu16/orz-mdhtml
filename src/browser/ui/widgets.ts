/**
 * KIND-INDEPENDENT chrome widgets, built on the kit's chrome vocabulary
 * (`CHROME_CSS` classes, `ICONS`, `showToast`; spec/shell-runtime.md §8):
 * buttons, a menu button (a non-modal popover with menu items, keyboard
 * operable), the header-setting picker every carrier needs (theme, measure;
 * slides' ratio; paged's template) and the AI menu with its review panel.
 *
 * Everything renders into a shadow root the caller owns; text is set as
 * text, never parsed as HTML (the icons are the kit's constants). Seam:
 * this module moves to orz-markdown `carrier/app` with the standalone
 * startup (REBUILD §3a owner decision 2).
 */
import { iconElement, type IconName, type UiDocument } from 'orz-markdown/carrier/shell';

/** Extra chrome CSS for these widgets and the standalone bar (installed next to `CHROME_CSS`). */
export const WIDGET_CSS = `
.orz-menu-wrap { position: relative; display: inline-flex; }
.orz-menu {
  position: absolute; z-index: var(--orz-chrome-z); top: calc(100% + 6px); right: 0; min-width: 180px;
  max-height: min(70vh, 420px); overflow: auto; padding: var(--orz-chrome-space-2);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);
  animation: orz-chrome-pop var(--orz-chrome-slow) var(--orz-chrome-ease) both;
}
.orz-menu[data-align="left"] { right: auto; left: 0; }
.orz-menu__label { padding: var(--orz-chrome-space-2) var(--orz-chrome-space-3); color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.orz-menu__item {
  display: flex; align-items: center; gap: var(--orz-chrome-space-3); width: 100%; min-height: 30px;
  padding: 0 var(--orz-chrome-space-3); border: 0; border-radius: var(--orz-chrome-radius-s);
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.orz-menu__item:hover, .orz-menu__item:focus-visible { background: var(--orz-chrome-hover); }
.orz-menu__item[aria-checked="true"] { font-weight: 600; }
.orz-menu__item .orz-menu__check { width: 16px; display: inline-flex; color: var(--orz-chrome-accent); }
.orz-menu__item .orz-menu__swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--orz-chrome-border); flex: none; }
.orz-menu__sep { height: 1px; margin: var(--orz-chrome-space-2) 0; background: var(--orz-chrome-border); }
.orz-review {
  position: fixed; z-index: var(--orz-chrome-z); right: var(--orz-chrome-space-5); bottom: var(--orz-chrome-space-6);
  width: min(520px, calc(100vw - 32px)); padding: var(--orz-chrome-space-4);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-l);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);
}
.orz-review__title { margin: 0 0 var(--orz-chrome-space-2); font: 600 var(--orz-chrome-text-md)/1.3 var(--orz-chrome-font); }
.orz-review textarea {
  display: block; width: 100%; min-height: 160px; resize: vertical; padding: var(--orz-chrome-space-3);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-s);
  background: var(--orz-chrome-bg); color: var(--orz-chrome-fg); font: 12px/1.5 var(--orz-chrome-mono);
}
.orz-review__actions { display: flex; justify-content: flex-end; gap: var(--orz-chrome-space-2); margin-top: var(--orz-chrome-space-3); }
`;

/** Install a stylesheet in a shadow root (constructed where supported, else a `<style>`). */
export function installCss(root: ShadowRoot, css: string): void {
  const win = root.ownerDocument?.defaultView as (Window & typeof globalThis) | null;
  try {
    if (win?.CSSStyleSheet && Array.isArray(root.adoptedStyleSheets)) {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    }
  } catch { /* fall back to a <style> */ }
  const style = root.ownerDocument.createElement('style');
  style.textContent = css;
  root.append(style);
}

export interface ButtonOptions {
  label: string;
  icon?: IconName;
  /** `primary`, `ghost` or plain. */
  variant?: 'primary' | 'ghost';
  /** Icon only (the label stays the accessible name). */
  iconOnly?: boolean;
  title?: string;
}

/** A chrome button named by its label (`aria-label`), with an optional kit icon. */
export function button(doc: Document, o: ButtonOptions): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = `orz-btn${o.variant ? ` orz-btn--${o.variant}` : ''}${o.iconOnly ? ' orz-btn--icon' : ''}`;
  b.setAttribute('aria-label', o.label);
  if (o.title ?? o.iconOnly) b.title = o.title ?? o.label;
  if (o.icon) b.append(iconElement(doc as unknown as UiDocument, o.icon) as unknown as Node);
  if (!o.iconOnly) {
    const span = doc.createElement('span');
    span.className = 'orz-btn__label';
    span.textContent = o.label;
    b.append(span);
  }
  return b;
}

/** One entry of a menu. */
export interface MenuItem {
  /** Menu label (text). */
  label: string;
  /** Called when chosen (the menu closes first). */
  run(): void;
  /** For a choice: whether it is the current one (`menuitemradio`). */
  checked?: boolean;
  /** A small colour swatch before the label (theme pickers). */
  swatch?: string;
  /** A separator before this item. */
  separator?: boolean;
  disabled?: boolean;
}

export interface MenuButton {
  readonly element: HTMLElement;
  readonly button: HTMLButtonElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

/**
 * A menu button: a chrome button that opens a non-modal popover of items
 * (`role="menu"`), built fresh from `items()` at each opening. Arrow keys move,
 * Enter/Space choose, Esc and a click outside close (focus returns to the
 * button). Never modal, never over the whole page.
 */
export function menuButton(doc: Document, o: ButtonOptions & { items(): MenuItem[]; heading?: string; align?: 'left' | 'right' }): MenuButton {
  const wrap = doc.createElement('span');
  wrap.className = 'orz-menu-wrap';
  const btn = button(doc, o);
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  wrap.append(btn);
  let menu: HTMLElement | null = null;
  const win = doc.defaultView!;

  const onOutside = (e: Event): void => {
    if (!menu) return;
    const path = e.composedPath();
    if (!path.includes(wrap)) close();
  };
  function close(): void {
    if (!menu) return;
    menu.remove();
    menu = null;
    btn.setAttribute('aria-expanded', 'false');
    win.removeEventListener('pointerdown', onOutside, true);
  }
  function items(): HTMLButtonElement[] {
    return menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('.orz-menu__item:not([disabled])')) : [];
  }
  function open(): void {
    if (menu) return;
    menu = doc.createElement('div');
    menu.className = 'orz-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', o.label);
    if (o.align === 'left') menu.setAttribute('data-align', 'left');
    if (o.heading) {
      const h = doc.createElement('div');
      h.className = 'orz-menu__label';
      h.textContent = o.heading;
      menu.append(h);
    }
    for (const it of o.items()) {
      if (it.separator) {
        const sep = doc.createElement('div');
        sep.className = 'orz-menu__sep';
        sep.setAttribute('role', 'separator');
        menu.append(sep);
      }
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'orz-menu__item';
      b.setAttribute('role', it.checked === undefined ? 'menuitem' : 'menuitemradio');
      if (it.checked !== undefined) b.setAttribute('aria-checked', String(it.checked));
      if (it.disabled) b.disabled = true;
      if (it.checked !== undefined) {
        const c = doc.createElement('span');
        c.className = 'orz-menu__check';
        if (it.checked) c.append(iconElement(doc as unknown as UiDocument, 'check') as unknown as Node);
        b.append(c);
      }
      if (it.swatch) {
        const s = doc.createElement('span');
        s.className = 'orz-menu__swatch';
        s.style.background = it.swatch;
        b.append(s);
      }
      const l = doc.createElement('span');
      l.textContent = it.label;
      b.append(l);
      b.addEventListener('click', () => {
        close();
        btn.focus();
        it.run();
      });
      menu.append(b);
    }
    menu.addEventListener('keydown', (e) => {
      const list = items();
      const at = list.indexOf((menu?.getRootNode() as ShadowRoot | Document).activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[(at + 1) % list.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
      else if (e.key === 'Tab') close();
    });
    wrap.append(menu);
    btn.setAttribute('aria-expanded', 'true');
    win.addEventListener('pointerdown', onOutside, true);
    const list = items();
    (list.find((b) => b.getAttribute('aria-checked') === 'true') ?? list[0])?.focus();
  }
  btn.addEventListener('click', () => (menu ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !menu) { e.preventDefault(); open(); }
  });
  return { element: wrap, button: btn, open, close, isOpen: () => menu !== null, destroy() { close(); wrap.remove(); } };
}

/**
 * A header setting the chrome offers (FC-18 §5.1 user choices): its key, its
 * choices, and how a text's current value reads. The carrier supplies the
 * list (md: theme, measure); the picker and the write (`setHeader` /
 * `editHeader`, one undoable edit) are kind-independent.
 */
export interface SettingControl {
  key: string;
  /** Accessible name of the picker ("Theme"). */
  label: string;
  icon: IconName;
  choices: ReadonlyArray<{ value: string; label: string; swatch?: string }>;
  /** The value a text has now (its default when the header has none). */
  current(text: string): string;
}

/** A picker for one setting: choosing calls `apply(key, value)` (the caller edits the header). */
export function settingPicker(doc: Document, control: SettingControl, getText: () => string, apply: (key: string, value: string) => void, o: { iconOnly?: boolean } = {}): MenuButton {
  return menuButton(doc, {
    label: control.label,
    icon: control.icon,
    iconOnly: o.iconOnly ?? false,
    heading: control.label,
    items: () => {
      const now = control.current(getText());
      return control.choices.map((c) => ({ label: c.label, checked: c.value === now, ...(c.swatch ? { swatch: c.swatch } : {}), run: () => { if (c.value !== control.current(getText())) apply(control.key, c.value); } }));
    },
  });
}

/** An AI operation as hosts offer it (`orz-host-ai@1`, FC-19 `hooks.ai.operations`). */
export interface AiOp { id: string; title: string; selection?: boolean }

/**
 * The review panel of an AI proposal (host-protocols §4: the document is
 * untouched until the reader applies it): the proposal in an editable
 * textarea, Apply / Cancel. Resolves the text to apply, or null.
 */
export function reviewProposal(root: ShadowRoot, proposed: string, o: { passage: boolean; title: string }): Promise<string | null> {
  const doc = root.ownerDocument;
  return new Promise((resolve) => {
    const panel = doc.createElement('section');
    panel.className = 'orz-review';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', `${o.title}: review the proposal`);
    const h = doc.createElement('p');
    h.className = 'orz-review__title';
    h.textContent = o.passage ? `${o.title} — replacement for the selection` : `${o.title} — proposed document`;
    const ta = doc.createElement('textarea');
    ta.value = proposed;
    ta.setAttribute('aria-label', 'Proposed text');
    const row = doc.createElement('div');
    row.className = 'orz-review__actions';
    const cancel = button(doc, { label: 'Cancel', variant: 'ghost' });
    const apply = button(doc, { label: o.passage ? 'Replace selection' : 'Replace document', variant: 'primary' });
    row.append(cancel, apply);
    panel.append(h, ta, row);
    const done = (v: string | null): void => { panel.remove(); resolve(v); };
    cancel.addEventListener('click', () => done(null));
    apply.addEventListener('click', () => done(ta.value));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } });
    root.append(panel);
    ta.focus();
  });
}
