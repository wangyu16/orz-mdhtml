/**
 * KIND-SPECIFIC (md): this carrier behind the standalone startup's seam
 * (`StandaloneKind`, ../standalone/types.ts) — its assemble, its creation
 * tool, its editor, its read view (in the page) and its header settings
 * (theme, measure).
 */
import { newDocument } from '../../assemble.js';
import { assemble, editorInternals, formats, kind, mountEditor, version } from '../carrier.js';
import type { StandaloneKind } from '../standalone/types.js';
import { createReadView } from './read-view.js';
import { MD_SETTINGS } from './settings.js';

export const MD_KIND: StandaloneKind = {
  kind,
  version,
  formats,
  assemble: (text, options) => assemble(text, options),
  newDocument: () => newDocument(),
  mountEditor: (element, options, ctx) => mountEditor(element, { text: options.text }, ctx),
  refreshEditorTools: (editor) => editorInternals(editor)?.refreshTools(),
  createReadView,
  settings: MD_SETTINGS,
};
