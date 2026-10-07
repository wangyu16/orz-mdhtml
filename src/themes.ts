/**
 * The orz-markdown themes an `md` document may name in its header `theme` key
 * (FC-18 §5.1). The ONE list in this repository: orz-markdown 2.1.0 ships the
 * theme stylesheets (`orz-markdown/themes/<id>.css`) but exports no list of
 * their ids, names or colour schemes, so this carrier keeps it here (reported
 * as a kit gap; move it to orz-markdown when it exports one).
 *
 * Same set, names and order as the orz-markdown PWA editor's theme menu.
 * Isomorphic: no Node built-ins.
 */

export interface ThemeInfo {
  /** The theme id: the stylesheet `themes/<id>.css` in orz-markdown. */
  id: string;
  /** The label a theme picker shows. */
  name: string;
  /** The colour scheme of the theme (for the chrome and code highlighting). */
  scheme: 'light' | 'dark';
}

export const THEMES: readonly ThemeInfo[] = Object.freeze([
  { id: 'light-neat-3', name: 'Orchard', scheme: 'light' },
  { id: 'light-neat-1', name: 'Neat', scheme: 'light' },
  { id: 'light-neat-2', name: 'Neat 2', scheme: 'light' },
  { id: 'light-academic-1', name: 'Academic', scheme: 'light' },
  { id: 'light-academic-2', name: 'Academic 2', scheme: 'light' },
  { id: 'beige-decent-1', name: 'Beige', scheme: 'light' },
  { id: 'beige-decent-2', name: 'Beige 2', scheme: 'light' },
  { id: 'light-playful-1', name: 'Playful', scheme: 'light' },
  { id: 'light-playful-2', name: 'Playful 2', scheme: 'light' },
  { id: 'dark-elegant-1', name: 'Dark Elegant', scheme: 'dark' },
  { id: 'dark-elegant-2', name: 'Dark Elegant 2', scheme: 'dark' },
  { id: 'dark-elegant-3', name: 'Nocturne', scheme: 'dark' },
]);

/** The theme of a document whose header names none (or an unknown one). */
export const DEFAULT_THEME = 'light-neat-3';

/** Whether `id` names one of {@link THEMES}. */
export function isThemeId(id: string): boolean {
  return THEMES.some((t) => t.id === id);
}

/** The theme `id` names, else the default theme. */
export function themeOf(id: string | undefined): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}
