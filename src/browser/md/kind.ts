/**
 * KIND-SPECIFIC (md): this carrier behind the kit's standalone seam
 * (`StandaloneKind`, orz-markdown `carrier/app`, spec/carrier-app.md §3) — its
 * assemble, its creation tool, its editor, its read view (in the page), its
 * header settings (theme, width), its repository (edit mode's GitHub link),
 * its reader control (the text size: 80–160 % in steps of 10, a reader
 * preference by uid, never the document) and the rest of its FC-19 §2
 * surface.
 */
import type { StandaloneKind } from 'orz-markdown/carrier/app';
import { newDocument } from '../../assemble.js';
import { assemble, extract, formats, kind, mountEditor, readDocument, renderPreview, version } from '../carrier.js';
import { createReadView } from './read-view.js';
import { MD_SETTINGS } from './settings.js';

export const MD_KIND: StandaloneKind = {
  kind,
  version,
  formats,
  assemble: (text, options) => assemble(text, options ?? {}),
  newDocument: () => newDocument(),
  mountEditor: (element, options, ctx) => mountEditor(element as unknown as HTMLElement, options as never, ctx),
  createReadView: (doc) => createReadView(doc as unknown as Document),
  settings: MD_SETTINGS,
  repo: 'https://github.com/wangyu16/orz-mdhtml',
  readerControls: { fontScale: { min: 80, max: 160, step: 10 } },
  readDocument,
  extract,
  renderPreview: (text, options) => renderPreview(text, options ?? {}),
};
