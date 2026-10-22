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
import { assemble, inspect, readLegacy, VERSION } from '../src/lib.js';
import { withoutHeader } from 'orz-markdown/carrier';
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

describe.concurrent('CLI backlog fixes (1.1.0)', { timeout: 180_000 }, () => {
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
  it('[T.25] a text with no uid is assembled with a warning that says to take a header from `new` (D-83a); inspect advises the same, and inspect of a .md.html with no x.md beside it advises `extract` (D-83b)', async () => {
    const d = folder();
    write(join(d, 's.md'), 'text only\n');
    const a = await cli(['assemble', 's.md'], d);
    expect(a.code).toBe(0);
    expect(a.stderr).toMatch(/warning: s\.md: the text has no header, so the document has no uid .*`orz-mdhtml new --title "…"` prints a fresh header — paste its \{\{nyml … \}\} block at the top of s\.md/);
    const aj = json(await cli(['assemble', 's.md', '--json'], d));
    expect(aj.uid).toBeNull();
    expect((aj.warnings as string[]).some((w) => w.includes('has no uid'))).toBe(true);
    // a header without a uid: copy the uid line
    write(join(d, 'h.md'), '{{nyml\nkind: document\ncarrier: md\n}}\n\n# H\n');
    expect((await cli(['assemble', 'h.md'], d)).stderr).toContain('the header has no uid');
    // a text with a uid: no such warning
    write(join(d, 'u.md'), '{{nyml\nkind: document\ncarrier: md\nuid: doc-abcdefghij12\n}}\n\n# U\n');
    const u = await cli(['assemble', 'u.md'], d);
    expect(u.stderr).toBe('');
    expect((await cli(['inspect', 'u.md'], d)).stdout).not.toContain('no uid');
    // inspect says it too
    expect((await cli(['inspect', 's.md'], d)).stdout).toContain('paste its {{nyml … }} block at the top of s.md');
    // D-83b: the .md.html alone
    const b = join(d, 'b');
    mkdirSync(b);
    copyFileSync(join(d, 'u.md.html'), join(b, 'u.md.html'));
    const r = JSON.parse((await cli(['inspect', 'b/u.md.html', '--json'], d)).stdout) as ReturnType<typeof inspect>;
    expect(r.twin).toBeNull();
    expect(r.advice).toContain('no text twin b/u.md beside it: `orz-mdhtml extract b/u.md.html` writes it (this file\'s text, exactly); edit b/u.md, then `orz-mdhtml assemble b/u.md`');
    // with the twin beside it, no such advice
    const withTwin = JSON.parse((await cli(['inspect', 'u.md.html', '--json'], d)).stdout) as ReturnType<typeof inspect>;
    expect(withTwin.twin).toMatchObject({ holds: 'same' });
    expect(withTwin.advice.join('\n')).not.toContain('no text twin');
  });
  it('[T.26] a 0.x file next to its own source: inspect (from either side) and upgrade compare it the same way — "the same text", and upgrade gives the twin a header without --force, keeping its text exactly (D-90)', async () => {
    for (const fixture of Object.values(LEGACY_FILES)) {
      const d = folder();
      const html = readFileSync(fixture, 'utf8');
      const source = readLegacy(html)!.text;
      write(join(d, 'notes.md.html'), html);
      write(join(d, 'notes.md'), source);
      const fromFile = JSON.parse((await cli(['inspect', 'notes.md.html', '--json'], d)).stdout) as ReturnType<typeof inspect>;
      expect(fromFile.twin, fixture).toMatchObject({ holds: 'same' });
      expect(fromFile.advice.join('\n')).toContain('run `orz-mdhtml upgrade notes.md.html` — it adds a header to notes.md');
      expect(fromFile.advice.join('\n')).not.toContain('--text');
      const fromText = JSON.parse((await cli(['inspect', 'notes.md', '--json'], d)).stdout) as ReturnType<typeof inspect>;
      expect(fromText.twin).toMatchObject({ holds: 'same' });
      expect(fromText.advice.join('\n')).toContain('`orz-mdhtml upgrade notes.md.html` adds a header to this text');
      expect(fromText.advice.join('\n')).not.toMatch(/assemble notes\.md`|no uid/);
      // extract names the same plain upgrade
      const ex = json(await cli(['extract', 'notes.md.html', '--json'], d));
      expect(ex).toMatchObject({ ok: false, reason: 'legacy-file', next: { command: 'upgrade', args: ['notes.md.html'] } });
      // upgrade does what inspect said: no refusal, no --force, no backup
      const up = await cli(['upgrade', 'notes.md.html', '--json'], d);
      expect(up.code, up.stdout).toBe(0);
      expect(json(up)).toMatchObject({ ok: true, twinWas: 'source', backups: [] });
      const twin = readFileSync(join(d, 'notes.md'), 'utf8');
      expect(twin).toMatch(/^\{\{nyml\n/);
      expect(withoutHeader(twin).body.endsWith(source.replace(/^﻿/, ''))).toBe(true);
      expect(existsSync(join(d, 'notes.md~'))).toBe(false);
      expect(shellOf(readFileSync(join(d, 'notes.md.html'), 'utf8'))).toBe(VERSION);
    }
    // a twin with other text is still refused, as before
    const d = folder();
    const html = readFileSync(Object.values(LEGACY_FILES)[0]!, 'utf8');
    write(join(d, 'notes.md.html'), html);
    write(join(d, 'notes.md'), `${readLegacy(html)!.text}\nan edit of my own\n`);
    expect((JSON.parse((await cli(['inspect', 'notes.md.html', '--json'], d)).stdout) as ReturnType<typeof inspect>).twin).toMatchObject({ holds: 'different' });
    expect(json(await cli(['upgrade', 'notes.md.html', '--json'], d))).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'upgrade', args: ['notes.md.html', '--text', 'notes.browser.md'] } });
  }, 180_000);
  it('[T.27] upgrade of a 0.x file reports the new uid (its 0.x id is not a uid) as a note, not a warning; what was not understood stays a warning (D-108)', async () => {
    const d = folder();
    copyFileSync(LEGACY_FILES['fixtures/sample.md.html']!, join(d, 'sample.md.html'));
    const human = await cli(['upgrade', 'sample.md.html'], d);
    expect(human.code, human.stderr).toBe(0);
    expect(human.stderr).toBe('');
    expect(human.stdout).toMatch(/^Note: the 0\.x id "[0-9a-f-]+" is not in the 1\.0 uid form .*so the document got a new uid$/m);
    expect(human.stdout).toMatch(/^Note: the 0\.x page title "sample" .*was not moved into the header/m);
    const e = folder();
    copyFileSync(LEGACY_FILES['fixtures/sample.md.html']!, join(e, 'sample.md.html'));
    const j = json(await cli(['upgrade', 'sample.md.html', '--json'], e));
    expect(j.warnings).toEqual([]);
    expect((j.notes as string[]).join('\n')).toMatch(/0\.x id .*new uid/);
    // an unknown theme is still a warning
    const f = folder();
    write(join(f, 'odd.md.html'), readFileSync(LEGACY_FILES['fixtures/sample.md.html']!, 'utf8').replace(/<html\b([^>]*)>/, '<html$1 data-theme="my-custom-theme">'));
    const odd = await cli(['upgrade', 'odd.md.html'], f);
    expect(odd.code).toBe(0);
    expect(odd.stderr).toMatch(/warning: theme "my-custom-theme" is not an orz-markdown theme; not moved/);
    expect(odd.stderr).not.toMatch(/0\.x id/);
  });

  it('[T.28] upgrade writes the running release\'s shell: a 0.x file and an older 1.x file both get shell = this package\'s version (D-93)', async () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
    const d = folder();
    copyFileSync(LEGACY_FILES['fixtures/sample.md.html']!, join(d, 'old.md.html'));
    expect(json(await cli(['upgrade', 'old.md.html', '--json'], d))).toMatchObject({ ok: true, shell: pkg.version });
    expect(shellOf(readFileSync(join(d, 'old.md.html'), 'utf8'))).toBe(pkg.version);
    // a 1.0.0 file (an older shell) is re-assembled with this one
    const older = assemble('{{nyml\nkind: document\ncarrier: md\nuid: doc-abcdefghij12\n}}\n\n# Old\n', { delivery: 'cdn' }).replace(`"shell":"${VERSION}"`, '"shell":"1.0.0"');
    expect(shellOf(older)).toBe('1.0.0');
    write(join(d, 'one.md.html'), older);
    const r = json(await cli(['upgrade', 'one.md.html', '--no-text', '--json'], d));
    expect(r).toMatchObject({ ok: true, previous: '1.0.0', shell: pkg.version });
    expect(shellOf(readFileSync(join(d, 'one.md.html'), 'utf8'))).toBe(pkg.version);
  });
  it('[T.29] the CLI\'s own messages are in user words: no contract ids, no "format-1", "before text format 1", "compatibility shim", "--replaces followed by the sha256" or "--replaces takes it" — in help, inspect, refusals and upgrade output (D-91)', async () => {
    const JARGON = [/FC-\d+/, /format-1/, /before text format/, /compatibility shim/, /\bexperimental\b/, /followed by (the|that) sha256/, /--replaces takes it/, /island was read as format 1/];
    const d = folder();
    const legacy = readFileSync(LEGACY_FILES['fixtures/sample.md.html']!, 'utf8');
    write(join(d, 'old.md.html'), legacy);
    write(join(d, 'old.md'), `${readLegacy(legacy)!.text}\nmine\n`);
    write(join(d, 'x.md'), '{{nyml\nkind: document\ncarrier: md\nuid: doc-abcdefghij12\n}}\n\n# X\n');
    const runs: Run[] = [];
    for (const c of ['new', 'assemble', 'extract', 'upgrade', 'inspect', 'themes']) runs.push(await cli([c, '--help'], d));
    runs.push(await cli(['--help'], d));
    runs.push(await cli(['inspect', 'old.md.html'], d), await cli(['inspect', 'old.md'], d));
    runs.push(await cli(['extract', 'old.md.html'], d), await cli(['assemble', 'old.md'], d), await cli(['assemble', 'old.md', '--replaces', '0'.repeat(64)], d));
    runs.push(await cli(['assemble', 'x.md'], d), await cli(['extract', 'x.md.html', '-o', 'y.md'], d));
    runs.push(await cli(['upgrade', 'old.md.html', '--text', 'old.browser.md'], d));
    for (const r of runs) for (const j of JARGON) expect(`${r.stdout}${r.stderr}`, String(j)).not.toMatch(j);
    // the sha256 line says what it is for
    expect(runs.at(-3)!.stdout).toMatch(/^  sha256 [0-9a-f]{64} \(of the text the file holds: pass it as --replaces, and a later assemble replaces the file only while it still holds this text\)$/m);
  }, 180_000);
});
