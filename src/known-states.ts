/**
 * NODE ONLY: the known states of a pair (`x.md` ↔ `x.md.html`) that the CLI
 * can prove, for the overwrite rules of `assemble` and `extract` (claims
 * T.7, T.11, T.12).
 *
 * `assemble` refuses to replace a `.md.html` that holds a different text than
 * the one being assembled — the file may hold work saved in the browser — and
 * `extract` refuses to replace a text twin that differs from the file's text
 * — it may hold edits made since (an agent's, an editor's). Either refusal is
 * lifted (no `--force`, no backup needed) only when what would be replaced is
 * provably a KNOWN STATE, so replacing it loses nothing:
 *
 * - **git**: the twin's last committed version (`git show HEAD:<twin>`), its
 *   staged version (`git show :<twin>`), or one of its recent commits
 *   (`git log -n 20 -- <twin>`, then `git show <sha>:<twin>`; bounded to 20
 *   commits and a few seconds in all), when the twin is tracked in a git
 *   repository — so a full clone knows the states its history holds (a
 *   shallow checkout, CI's default `--depth 1`, knows only its last commit:
 *   use `--replaces` there). A text equal to one of these counts as known, so
 *   a deliberate revert of the other file to such a text is replaced —
 *   commit the revert first. `git` runs only if it is installed; any failure (no git,
 *   not a repository, not tracked, a timeout) means "unknown".
 * - **the CLI's own record**: a small cache under the user's cache folder
 *   (`$XDG_CACHE_HOME/orz-mdhtml/`, else `~/.cache/orz-mdhtml/`) holding,
 *   per pair (the twin's absolute path + the file's absolute path, symbolic
 *   links resolved), the SHA-256 of the text the CLI last wrote into the
 *   file or read out of it and of the twin's exact text at that moment —
 *   written by `assemble`, `extract`, `new --html` and `upgrade` when they
 *   write a pair. The record only ever relaxes a refusal when the text hashes
 *   to exactly that value; a browser save (or an edit of the twin) changes
 *   the text, so its hash no longer matches and the refusal stands.
 * - **the caller's token** (`--replaces <sha256>`, in the CLI): a portable
 *   compare-and-swap for agents in fresh sandboxes — the SHA-256 of the text
 *   the caller saw (`inspect`, `extract`, `assemble` print it).
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

/**
 * Why a text counts as a known state: `cache` (the CLI's record of the
 * pair), `git-head`, `git-index`, `git-log` (a recent commit of the twin),
 * `token` (the caller's `--replaces` hash matched).
 */
export type EarlierState = 'git-head' | 'git-index' | 'git-log' | 'cache' | 'token';

/** How many recent commits of the twin are read, and for how long at most (all of git's runs together). */
export const GIT_LOG_LIMIT = 20;
const GIT_BUDGET_MS = 8000;

/** The SHA-256 (hex) of a text's UTF-8 bytes — the pair records' and `--replaces`' hash. */
export const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

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
 * Whether the pair was recorded: `recorded`, `no-cache` (no cache folder:
 * no `$XDG_CACHE_HOME`, no home), or `failed` (the cache is not writable).
 */
export type Remembered = 'recorded' | 'no-cache' | 'failed';

/**
 * Record that `file` holds `held` (the text the CLI just wrote into it or
 * read out of it) and that the twin holds exactly `twinText` (its raw text,
 * line endings as written) for the pair `twin` ↔ `file`. Call after both are
 * written. Never throws: says whether the record was written.
 */
export function rememberPair(twin: string, file: string, held: string, twinText: string): Remembered {
  const path = recordPath(twin, file);
  if (!path) return 'no-cache';
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify({ twin: canonical(twin), file: canonical(file), text: sha256(held), twinText: sha256(twinText) })}\n`, 'utf8');
    renameSync(tmp, path);
    return 'recorded';
  } catch {
    try { unlinkSync(tmp); } catch { /* not created */ }
    return 'failed';
  }
}

interface PairRecord { twin?: unknown; file?: unknown; text?: unknown; twinText?: unknown }

/** The record of the pair, or null (none, unreadable, or another pair's). */
function recordOf(twin: string, file: string): PairRecord | null {
  const path = recordPath(twin, file);
  if (!path) return null;
  try {
    const r = JSON.parse(readFileSync(path, 'utf8')) as PairRecord;
    return r.twin === canonical(twin) && r.file === canonical(file) ? r : null;
  } catch {
    return null;
  }
}

/** True when the record says the CLI itself last wrote (or read) exactly `held` for this pair. */
function rememberedHolds(twin: string, file: string, held: string): boolean {
  return recordOf(twin, file)?.text === sha256(held);
}

/** True when the record says the twin held exactly `current` (raw, line endings as written) when the CLI last synced the pair. */
function rememberedTwin(twin: string, file: string, current: string): boolean {
  return recordOf(twin, file)?.twinText === sha256(current);
}

/** Run git in the twin's folder; null on any failure or when the deadline has passed. */
function git(twin: string, args: string[], deadline: number): Buffer | null {
  const left = deadline - Date.now();
  if (left <= 0) return null;
  try {
    return execFileSync('git', ['-C', dirname(canonical(twin)), ...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: Math.min(5000, left),
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

/** A tracked file's text at `rev` (`HEAD:`, the index `:`, or `<sha>:`), or null when it cannot be had. */
function gitText(twin: string, rev: string, deadline: number): string | null {
  const out = git(twin, ['show', `${rev}./${basename(canonical(twin))}`], deadline);
  if (out === null) return null;
  try { return decodeText(out, { fatal: true }); } catch { return null; }
}

/**
 * The twin's known texts in git, lazily, most likely first: HEAD, the index,
 * then up to {@link GIT_LOG_LIMIT} recent commits that touched it (its HEAD
 * text is not repeated). Stops at the deadline.
 */
function* gitStates(twin: string, deadline: number): Generator<[EarlierState, string]> {
  const head = gitText(twin, 'HEAD:', deadline);
  if (head !== null) yield ['git-head', head];
  const index = gitText(twin, ':', deadline);
  if (index !== null && index !== head) yield ['git-index', index];
  if (head === null && index === null) return; // not tracked (or no git): no history either
  const log = git(twin, ['log', '-n', String(GIT_LOG_LIMIT), '--format=%H', '--', `./${basename(canonical(twin))}`], deadline);
  if (log === null) return;
  const seen = new Set<string>([head ?? '', index ?? '']);
  for (const sha of log.toString('utf8').split('\n').map((l) => l.trim()).filter((l) => /^[0-9a-f]{40,64}$/.test(l))) {
    const t = gitText(twin, `${sha}:`, deadline);
    if (t === null || seen.has(t)) continue;
    seen.add(t);
    yield ['git-log', t];
  }
}

/**
 * Whether `held` — the text an existing file holds — is a known earlier state
 * of the twin `twin` (see the module comment), and which. `stored` maps a
 * twin text to the text a file assembled from it holds (mixed line endings
 * become one style), so a committed text compares like a file's. With
 * `git: false` only the pair's record counts (an `-o` output that is not the
 * twin's own file: the twin's history says nothing about it).
 */
export function earlierStateOf(twin: string, file: string, held: string, stored: (text: string) => string, options: { git?: boolean } = {}): EarlierState | null {
  if (rememberedHolds(twin, file, held)) return 'cache';
  if (options.git === false) return null;
  for (const [state, text] of gitStates(twin, Date.now() + GIT_BUDGET_MS)) if (stored(text) === held) return state;
  return null;
}

/**
 * Whether the text twin's current text `current` is a known state, so
 * `extract` may replace it with the file's text without losing an edit: the
 * exact text (raw: a line-ending change is a change) the CLI last wrote or
 * read for the pair (the twin unchanged since), or a committed or staged
 * version of it in git (its content is in the history), compared exactly.
 * Null: unknown — it may hold edits made since.
 */
export function twinStateOf(twin: string, file: string, current: string): EarlierState | null {
  if (rememberedTwin(twin, file, current)) return 'cache';
  for (const [state, text] of gitStates(twin, Date.now() + GIT_BUDGET_MS)) if (text === current) return state;
  return null;
}

/**
 * True when `path` is tracked in git and unmodified (`git status` clean):
 * its modification time is then a checkout's, not an edit's. False on any
 * failure (no git, not a repository, not tracked, a timeout).
 */
export function cleanInGit(path: string): boolean {
  const deadline = Date.now() + 3000;
  const name = `./${basename(canonical(path))}`;
  if (git(path, ['ls-files', '--error-unmatch', '--', name], deadline) === null) return false;
  const status = git(path, ['status', '--porcelain', '--', name], deadline);
  return status !== null && status.toString('utf8').trim() === '';
}
