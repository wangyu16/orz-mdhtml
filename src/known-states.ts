/**
 * NODE ONLY: the earlier states of a text twin that the CLI can prove, for
 * the smoother assemble rule (round 1 of the carrier-app loop; claim T.11).
 *
 * `assemble` refuses to replace a `.md.html` that holds a different text than
 * the one being assembled — the file may hold work saved in the browser. That
 * refusal is lifted (no `--force`, no backup needed) only when the file's
 * text is provably an EARLIER STATE OF THE TWIN, so replacing it loses
 * nothing a browser added:
 *
 * - **git**: the twin's last committed version (`git show HEAD:<twin>`) or
 *   its staged version (`git show :<twin>`), when the twin is tracked in a
 *   git repository. `git` runs only if it is installed; any failure (no git,
 *   not a repository, not tracked, a timeout) means "unknown".
 * - **the CLI's own record**: a small cache under the user's cache folder
 *   (`$XDG_CACHE_HOME/orz-mdhtml/`, else `~/.cache/orz-mdhtml/`) holding,
 *   per pair (the twin's absolute path + the file's absolute path), the
 *   SHA-256 of the text the CLI last wrote into the file or read out of it —
 *   written by `assemble`, `extract`, `new --html` and `upgrade` when they
 *   write a pair. The record only ever relaxes the refusal when the file's
 *   text hashes to exactly that value; a browser save changes the text, so
 *   its hash no longer matches and the refusal stands.
 *
 * The record is a convenience, never a source of truth: a missing,
 * unreadable or unwritable cache only means "unknown" (refuse as before).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { decodeText } from 'orz-markdown/carrier';

/** Why a file's text counts as an earlier state of its twin. */
export type EarlierState = 'git-head' | 'git-index' | 'cache';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** A path as the record keys it: the real path when it exists (a symbolic link counts as its target). */
function canonical(path: string): string {
  try { return realpathSync(path); } catch { return resolve(path); }
}

/** The CLI's cache folder: `$XDG_CACHE_HOME/orz-mdhtml`, else `~/.cache/orz-mdhtml`; null without a home. */
export function cacheDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const xdg = env.XDG_CACHE_HOME;
  if (xdg && isAbsolute(xdg)) return join(xdg, 'orz-mdhtml');
  let home = '';
  try { home = homedir(); } catch { return null; }
  return home ? join(home, '.cache', 'orz-mdhtml') : null;
}

function recordPath(twin: string, file: string): string | null {
  const dir = cacheDir();
  return dir ? join(dir, 'pairs', `${sha256(`${canonical(twin)}\0${canonical(file)}`)}.json`) : null;
}

/**
 * Record that `file` holds `text` (the text the CLI just wrote into it or
 * read out of it) for the pair `twin` ↔ `file`. Call after both are written.
 * Never throws.
 */
export function rememberPair(twin: string, file: string, text: string): void {
  const path = recordPath(twin, file);
  if (!path) return;
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify({ twin: canonical(twin), file: canonical(file), text: sha256(text) })}\n`, 'utf8');
    renameSync(tmp, path);
  } catch {
    try { unlinkSync(tmp); } catch { /* not created */ }
  }
}

/** True when the record says the CLI itself last wrote (or read) exactly `held` for this pair. */
function rememberedHolds(twin: string, file: string, held: string): boolean {
  const path = recordPath(twin, file);
  if (!path) return false;
  try {
    const r = JSON.parse(readFileSync(path, 'utf8')) as { twin?: unknown; file?: unknown; text?: unknown };
    return r.twin === canonical(twin) && r.file === canonical(file) && r.text === sha256(held);
  } catch {
    return false;
  }
}

/** A tracked file's text at `rev` (`HEAD:` or the index, `:`), or null when it cannot be had. */
function gitText(twin: string, rev: 'HEAD:' | ':'): string | null {
  const real = canonical(twin);
  try {
    const out = execFileSync('git', ['-C', dirname(real), 'show', `${rev}./${basename(real)}`], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true,
    });
    return decodeText(out, { fatal: true });
  } catch {
    return null;
  }
}

/**
 * Whether `held` — the text an existing file holds — is a known earlier state
 * of the twin `twin` (see the module comment), and which. `stored` maps a
 * twin text to the text a file assembled from it holds (mixed line endings
 * become one style), so a committed text compares like a file's.
 */
export function earlierStateOf(twin: string, file: string, held: string, stored: (text: string) => string): EarlierState | null {
  if (rememberedHolds(twin, file, held)) return 'cache';
  const head = gitText(twin, 'HEAD:');
  if (head !== null && stored(head) === held) return 'git-head';
  const index = gitText(twin, ':');
  if (index !== null && index !== head && stored(index) === held) return 'git-index';
  return null;
}
