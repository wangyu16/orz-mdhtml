/**
 * KIND-SPECIFIC (md): the header settings the chrome and the editor's toolbar
 * offer — `theme` (the kit's bundled themes) and `measure` (normal / wide /
 * full; labelled "Width"), FC-18 §5.1. Document data (owner decision 4):
 * choosing writes the header. Each theme's dot is the kit's `themeSwatch`
 * (its page and signature colours, orz-markdown 2.5.0; STATUS D-95).
 */
import type { SettingControl } from 'orz-markdown/carrier/app';
import { THEMES, themeSwatch } from '../../themes.js';
import { MEASURES, MEASURE_LABELS, presentationOf } from '../../presentation.js';

export const MD_SETTINGS: readonly SettingControl[] = Object.freeze([
  {
    key: 'theme',
    label: 'Theme',
    icon: 'theme',
    choices: THEMES.map((t) => ({ value: t.id, label: t.name, swatch: themeSwatch(t.id) })),
    current: (text: string) => presentationOf(text).theme.id,
  },
  {
    key: 'measure',
    label: 'Width',
    icon: 'measure',
    choices: MEASURES.map((m) => ({ value: m, label: MEASURE_LABELS[m] })),
    current: (text: string) => presentationOf(text).measure,
  },
]);
