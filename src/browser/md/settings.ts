/**
 * KIND-SPECIFIC (md): the header settings the chrome offers — `theme` (the
 * 12 orz-markdown themes) and `measure` (normal / wide / full), FC-18 §5.1.
 * Document data (owner decision 4): choosing writes the header.
 */
import { THEMES } from '../../themes.js';
import { MEASURES, MEASURE_LABELS, presentationOf } from '../../presentation.js';
import type { SettingControl } from '../ui/widgets.js';

/** A swatch colour per scheme (the chrome cannot read a theme's colours without loading it). */
const SWATCH = { light: 'oklch(97% 0.01 100)', dark: 'oklch(28% 0.02 260)' } as const;

export const MD_SETTINGS: readonly SettingControl[] = Object.freeze([
  {
    key: 'theme',
    label: 'Theme',
    icon: 'theme',
    choices: THEMES.map((t) => ({ value: t.id, label: t.name, swatch: SWATCH[t.scheme] })),
    current: (text: string) => presentationOf(text).theme.id,
  },
  {
    key: 'measure',
    label: 'Measure',
    icon: 'split',
    choices: MEASURES.map((m) => ({ value: m, label: MEASURE_LABELS[m] })),
    current: (text: string) => presentationOf(text).measure,
  },
]);
