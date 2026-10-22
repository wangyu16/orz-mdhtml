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
import { assembleEnvelope } from 'orz-markdown/carrier';
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
  it('[T.23] a command name orz-mdhtml does not have is a usage error, never read as a file (D-105); the synopses name --cdn | --inline and the measures (D-107); themes --json names each theme `name` (D-106)', async () => {
    const d = folder();
    write(join(d, 'notes.md'), '# Notes\n');
    for (const args of [['templates', '--help'], ['templates'], ['help', 'templates']]) {
      const r = await cli(args, d);
      expect(r.code, args.join(' ')).toBe(2);
      expect(r.stdout, args.join(' ')).toBe('');
      expect(r.stderr).toContain('orz-mdhtml has no templates');
      expect(r.stderr).toContain('`orz-mdhtml themes`');
      expect(r.stderr).not.toMatch(/no such file|orz-mdhtml assemble/);
    }
    const j = json(await cli(['frobnicate', '--json'], d));
    expect(j).toMatchObject({ ok: false, command: 'frobnicate', reason: 'bad-usage', exitCode: 2 });
    expect(String(j.error)).toContain('has no command "frobnicate"');
    // a bare word next to its .md names the command to run
    expect((await cli(['notes'], d)).stderr).toContain('`orz-mdhtml assemble notes.md`');
    expect(existsSync(join(d, 'notes.md.html'))).toBe(false);
    // a bare word that IS a file is still assembled as before (the shorthand)
    write(join(d, 'plain'), '# Plain\n');
    expect((await cli(['plain', '-o', 'plain.md.html'], d)).code).toBe(0);
    // synopses
    const usage = (await cli(['--help'], d)).stdout;
    expect(usage).toContain('orz-mdhtml new [file.md] [--title T] [--theme id] [--measure normal|wide|full] [--lang l] [--html] [--cdn | --inline]');
    expect(usage).toContain('orz-mdhtml assemble <file.md> [-o out.md.html] [--cdn | --inline] ');
    expect((await cli(['assemble', '--help'], d)).stdout.split('\n')[0]).toContain('[--cdn | --inline]');
    expect((await cli(['new', '--help'], d)).stdout.split('\n')[0]).toContain('[--measure normal|wide|full]');
    // themes --json: the picker name is `name` (the family key), no `label`
    const themes = json(await cli(['themes', '--json'], d)).themes as Array<Record<string, unknown>>;
    for (const t of themes) {
      expect(typeof t.name).toBe('string');
      expect(t).not.toHaveProperty('label');
    }
  });
  it('[T.24] inspect of another kind\'s file names that file\'s kind and shell (orz-slides 1.0.0, not orz-mdhtml) and points to its CLI, reason other-kind (D-78)', async () => {
    const d = folder();
    const text = '{{nyml\nkind: document\ncarrier: slides\nuid: doc-2qvjtq3scd874lpy\n}}\n\n# Deck\n';
    write(join(d, 'talk.slides.html'), assembleEnvelope(text, { kind: 'slides', shellVersion: '1.0.0', delivery: 'inline', headHtml: '', bodyHtml: '' }));
    const human = await cli(['inspect', 'talk.slides.html'], d);
    expect(human.code).toBe(0);
    expect(human.stdout).toMatch(/^shell +orz-slides 1\.0\.0 \(another kind: use orz-slides\), inline delivery$/m);
    expect(human.stdout).not.toMatch(/orz-mdhtml 1\.0\.0|\(unknown\)/);
    expect(human.stdout).toContain('`npx orz-slides inspect talk.slides.html`');
    const r = JSON.parse((await cli(['inspect', 'talk.slides.html', '--json'], d)).stdout) as ReturnType<typeof inspect>;
    expect(r.reason).toBe('other-kind');
    expect(r.kind).toBe('slides');
    expect(r.shell).toMatchObject({ tool: 'orz-slides', version: '1.0.0' });
    expect(r.writable).toBe(false);
    // the text of another kind too; an md file has no reason
    write(join(d, 'deck.slides.md'), text);
    expect((JSON.parse((await cli(['inspect', 'deck.slides.md', '--json'], d)).stdout) as ReturnType<typeof inspect>).reason).toBe('other-kind');
    expect(inspect(assemble('# A\n', { delivery: 'cdn' }), { filename: 'a.md.html' })).not.toHaveProperty('reason');
    expect(inspect(assemble('# A\n', { delivery: 'cdn' })).shell).toMatchObject({ tool: 'orz-mdhtml', version: VERSION });
  });
});
