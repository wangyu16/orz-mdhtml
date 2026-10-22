/**
 * The 1.1.0 backlog fixes of the CLI (family STATUS D-77, D-78, D-83, D-90,
 * D-93, D-105, D-106, D-107, D-108, D-91): each test spawns the real CLI
 * (`dist/cli.js`, compiled by tests/global-setup.ts) on files in a temporary
 * folder, as tests/cli.test.ts does.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assemble, inspect, VERSION } from '../src/lib.js';
import { LEGACY_FILES } from './helpers.js';

const CLI = join(process.cwd(), 'dist', 'cli.js');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'orz-mdhtml-backlog-')));
const CACHE = join(tmp, '.cache');
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const folder = (): string => { const d = join(tmp, `t${++n}`); mkdirSync(d); return d; };

interface Run { code: number; stdout: string; stderr: string }
function cli(args: string[], cwd: string = tmp): Promise<Run> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, XDG_CACHE_HOME: CACHE } }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
      if (error && typeof error.code !== 'number') reject(error); else resolve({ code, stdout, stderr });
    });
  });
}
const json = (r: Run): Record<string, unknown> => JSON.parse(r.stdout) as Record<string, unknown>;
const write = (path: string, s: string): void => writeFileSync(path, s, 'utf8');
const shellOf = (html: string): string => /"shell":"([^"]*)"/.exec(html)?.[1] ?? '';

describe.concurrent('CLI backlog fixes (1.1.0)', () => {
  it('[T.22] a reader that closes the pipe early (assemble x.md -o - | head -c 10) ends the command quietly: exit 0, no stack (D-77)', async () => {
    const d = folder();
    write(join(d, 'x.md'), `# Big\n\n${'lorem ipsum '.repeat(20000)}\n`);
    const r = await new Promise<Run>((resolve) => {
      const child = spawn(process.execPath, [CLI, 'assemble', 'x.md', '-o', '-'], { cwd: d, env: { ...process.env, XDG_CACHE_HOME: CACHE } });
      let stderr = '';
      let got = '';
      child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
      child.stdout.once('data', (b: Buffer) => { got = b.toString().slice(0, 10); child.stdout.destroy(); });
      child.on('close', (code) => resolve({ code: code ?? -1, stdout: got, stderr }));
    });
    expect(r.stdout).toBe('<!doctype ');
    expect(r.stderr).not.toMatch(/EPIPE|Unhandled|node:events/);
    expect(r.code).toBe(0);
  });
});
