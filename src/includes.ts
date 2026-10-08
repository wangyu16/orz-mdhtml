/**
 * NODE ONLY (the CLI): the include directives of a text and their record
 * (FC-18 §8.3, D4). A file shows an include only from its `#orz-includes`
 * record (target as written → text): a page reads no local files and,
 * standalone, fetches no URLs. So the CLI
 *
 * - lists the include directives of a text (`includeTargets`), exactly as the
 *   renderer finds them (orz-markdown's parser: not in code, comments or other
 *   directives' bodies);
 * - resolves FILE includes relative to the text's folder
 *   (`resolveFileIncludes`, `assemble --resolve-includes`), refusing a path
 *   that leaves the folder (symlinks followed) — the renderer's
 *   `markdownIncludeRoot` rule;
 * - names the directives a record leaves unresolved (`unresolvedIncludes`):
 *   the file shows nothing there.
 *
 * One level, as the renderer: a directive inside an included file is not
 * expanded (and not resolved here).
 */
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { md } from 'orz-markdown';
import { decodeText, withoutHeader } from 'orz-markdown/carrier';

/** The include directive names (orz-markdown's `INCLUDE_DIRECTIVES`). */
const DIRECTIVES: ReadonlySet<string> = new Set(['markdown', 'md', 'md-include']);

const isUrl = (t: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(t);

/** A file target on a virtual root (as the record's reader normalizes it: `./a.md` = `a.md`). */
function rootPath(target: string): string {
  const out: string[] = [];
  for (const seg of target.replace(/^[A-Za-z]:/, '').split(/[\\/]/)) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return `/${out.join('/')}`;
}

/** The include targets of a text's body, as written, in order, without repeats. */
export function includeTargets(text: string): string[] {
  const tokens = md.parse(withoutHeader(text).body, {}) as Array<{ type: string; info: string; content: string }>;
  const seen = new Set<string>();
  for (const t of tokens) {
    if (t.type !== 'plugin_block' || !DIRECTIVES.has(t.info)) continue;
    const target = (t.content || '').trim();
    if (target) seen.add(target);
  }
  return [...seen];
}

/** The record entry that answers a target, if any (URLs exactly; files by their normalized path). */
function entryFor(record: Readonly<Record<string, string>>, target: string): string | null {
  if (Object.prototype.hasOwnProperty.call(record, target)) return target;
  if (isUrl(target)) return null;
  const want = rootPath(target);
  return Object.keys(record).find((k) => !isUrl(k) && rootPath(k) === want) ?? null;
}

/** The entries of `record` the text still includes (a removed directive's entry is dropped). */
export function keepReferenced(text: string, record: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const target of includeTargets(text)) {
    const key = entryFor(record, target);
    if (key !== null) out[key] = record[key]!;
  }
  return out;
}

/** The include targets of the text the record does not answer. */
export function unresolvedIncludes(text: string, record: Readonly<Record<string, string>>): string[] {
  return includeTargets(text).filter((t) => entryFor(record, t) === null);
}

/**
 * Read the text's file includes from `folder` (the text twin's folder): each
 * target as written → the file's exact text (UTF-8). A target outside the
 * folder (after symlinks), missing or not UTF-8 is not resolved, with the
 * reason in `problems`. URL targets are left alone.
 */
export function resolveFileIncludes(text: string, folder: string): { includes: Record<string, string>; problems: string[] } {
  const includes: Record<string, string> = {};
  const problems: string[] = [];
  let root: string;
  try { root = realpathSync(folder); } catch { return { includes, problems: [`the folder ${folder} cannot be read`] }; }
  for (const target of includeTargets(text)) {
    if (isUrl(target)) continue;
    const path = resolve(folder, target.replace(/\\/g, '/'));
    let real: string;
    try { real = realpathSync(path); } catch {
      problems.push(`{{md ${target}}}: no such file (${path})`);
      continue;
    }
    const rel = relative(root, real);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      problems.push(`{{md ${target}}}: outside the text's folder (${root}); not read`);
      continue;
    }
    try {
      includes[target] = decodeText(readFileSync(real), { fatal: true });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      problems.push(`{{md ${target}}}: ${code === 'EISDIR' ? 'a folder' : code ? (e as Error).message : 'not valid UTF-8'}`);
    }
  }
  return { includes, problems };
}
