/**
 * The orz-markdown themes an `md` document may name in its header `theme` key
 * (FC-18 §5.1): the kit's one theme list (`orz-markdown/themes`, 2.3.0 —
 * ids, picker names and colour schemes), re-exported. This repository keeps
 * no list of its own.
 *
 * Isomorphic: no Node built-ins.
 */
import { themeInfo, type ThemeInfo } from 'orz-markdown/themes';

export { THEMES, DEFAULT_THEME, isThemeId, themeInfo } from 'orz-markdown/themes';
export type { ThemeInfo, ThemeScheme } from 'orz-markdown/themes';

/** The theme `id` names, else the default theme (the kit's `themeInfo`). */
export function themeOf(id: string | undefined): ThemeInfo {
  return themeInfo(id);
}
