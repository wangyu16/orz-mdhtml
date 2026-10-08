/**
 * Rebuild step 5 — the CLI (FC-10; claims T.1–T.7). Every test spawns the
 * real CLI — `dist/cli.js`, compiled by tests/global-setup.ts as `npm run
 * build` does — on files in a temporary folder, and compares what it wrote with the
 * library's own results: golden files, byte-exact round trips (CR LF, BOM),
 * the legacy fixtures, `--json` that parses, exit statuses, and the
 * overwrite guards.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintHeader, readHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { assemble, extract, inspect, readDocument, upgrade, DEFAULT_THEME, ORZ_MARKDOWN_VERSION, THEMES, VERSION } from '../src/lib.js';
import { storedText } from '../src/assemble.js';
import { sha256 } from '../src/sha256.js';
import { createHash } from 'node:crypto';
import { corpus, HAZARDS, LEGACY_FILES, read } from './helpers.js';

const CLI = join(process.cwd(), 'dist', 'cli.js');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'orz-mdhtml-cli-')));
/** The CLI's cache (the pair records of T.11) lives here, never in the user's ~/.cache. */
const CACHE = join(tmp, '.cache');
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
/** A fresh folder for one scenario. */
const folder = (): string => { const d = join(tmp, `t${++n}`); mkdirSync(d); return d; };

interface Run { code: number; stdout: string; stderr: string }
/** Spawn the CLI (cwd = the given folder, so relative names are relative to it). */
function cli(args: string[], cwd: string = tmp, env: NodeJS.ProcessEnv = {}): Promise<Run> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, XDG_CACHE_HOME: CACHE, ...env } }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
      if (error && typeof error.code !== 'number') reject(error); else resolve({ code, stdout, stderr });
    });
  });
}
/** The CLI's raw stdout bytes. */
function cliBytes(args: string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, XDG_CACHE_HOME: CACHE } }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}
const json = (r: Run): Record<string, unknown> => JSON.parse(r.stdout) as Record<string, unknown>;
const bytes = (path: string): Buffer => readFileSync(path);
const text = (path: string): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(readFileSync(path));
const write = (path: string, s: string): void => writeFileSync(path, s, 'utf8');
/** Set a file's modification time (seconds since the epoch). */
const touch = (path: string, t: number): void => utimesSync(path, t, t);
const noTemp = (dir: string): void => { expect(readdirSync(dir).filter((f) => f.includes('.orz-') && f.endsWith('.tmp'))).toEqual([]); };

/** The golden files hold the two versions as placeholders, so a version bump does not rewrite them. */
const golden = (s: string): string => s.split(VERSION).join('{{VERSION}}').split(ORZ_MARKDOWN_VERSION).join('{{ORZ_MARKDOWN}}');
const GOLDEN = 'tests/fixtures/cli';

describe.concurrent('the CLI', () => {
  it('[T.1] assemble (and `orz-mdhtml <file.md>`) writes x.md.html = the library\'s assemble of the exact text: inline by default, --cdn, -o, -o -; golden output', async () => {
    const d = folder();
    const source = read(`${GOLDEN}/golden.md`);
    write(join(d, 'golden.md'), source);
    // the cdn file against the checked-in golden (the versions as placeholders)
    const g = await cli(['assemble', 'golden.md', '--cdn', '-o', 'golden.cdn.md.html'], d);
    expect(g.code, g.stderr).toBe(0);
    expect(golden(text(join(d, 'golden.cdn.md.html')))).toBe(read(`${GOLDEN}/golden.cdn.md.html`));
    expect(g.stdout).toBe(`Wrote ${join(d, 'golden.cdn.md.html')} (cdn, orz-mdhtml ${VERSION})\n`);

    const samples: Array<[string, string]> = [
      ['crlf-bom', `\uFEFF${source.replace(/\n/g, '\r\n')}`],
      ['cr', HAZARDS['cr']!],
      ['script-close', HAZARDS['script-close']!],
      ['corpus', corpus('md')[0]!.text],
    ];
    for (const [name, t] of samples) {
      write(join(d, `${name}.md`), t);
      const r = await cli(['assemble', `${name}.md`, '--json'], d);
      expect(r.code, r.stderr).toBe(0);
      const out = join(d, `${name}.md.html`);
      expect(bytes(out).equals(Buffer.from(assemble(t), 'utf8')), name).toBe(true);
      expect(extract(text(out))!.text === t, name).toBe(true);
      const info = readDocument(t);
      expect(json(r)).toEqual({ ok: true, command: 'assemble', input: join(d, `${name}.md`), output: out, kind: 'md', format: 1, shell: VERSION, delivery: 'inline', uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null, includes: 0, resolved: 0, unresolved: [], backup: null, replaced: null, sha256: sha256(storedText(t)), bytes: Buffer.byteLength(assemble(t), 'utf8'), warnings: json(r).warnings });
      // the shorthand is the same command
      rmSync(out);
      expect((await cli([`${name}.md`], d)).code).toBe(0);
      expect(bytes(out).equals(Buffer.from(assemble(t), 'utf8'))).toBe(true);
      // --cdn
      expect((await cli([`${name}.md`, '--cdn', '--force'], d)).code).toBe(0);
      expect(text(out)).toBe(assemble(t, { delivery: 'cdn' }));
    }
    // -o elsewhere, and -o - to stdout
    expect((await cli(['assemble', 'crlf-bom.md', '-o', 'sub-out.md.html'], d)).code).toBe(0);
    expect(text(join(d, 'sub-out.md.html')) === assemble(samples[0]![1])).toBe(true);
    const so = await cli(['assemble', 'cr.md', '--cdn', '-o', '-'], d);
    expect(so.code).toBe(0);
    expect(so.stdout).toBe(assemble(HAZARDS['cr']!, { delivery: 'cdn' }));
    noTemp(d);
  }, 120_000);

  it('[T.2] new writes a lint-clean text twin (carrier md, a fresh uid, the given keys) and with --html its file; stdout without a file; refusals', async () => {
    const d = folder();
    const r = await cli(['new', 'notes.md', '--title', 'My notes', '--theme', 'dark-elegant-1', '--measure', 'wide', '--lang', 'de', '--html', '--json'], d);
    expect(r.code, r.stderr).toBe(0);
    const t = text(join(d, 'notes.md'));
    const h = readHeader(t)!;
    expect(t.split('\n').slice(0, 9)).toEqual(['{{nyml', 'kind: document', 'carrier: md', `uid: ${h.fields['uid']}`, 'title: My notes', 'theme: dark-elegant-1', 'measure: wide', 'lang: de', '}}']);
    expect(h.fields).toMatchObject({ carrier: 'md', title: 'My notes', theme: 'dark-elegant-1', measure: 'wide', lang: 'de' });
    expect(UID_PATTERN.test(h.fields['uid']!)).toBe(true);
    expect(lintHeader(t, 'md')).toEqual([]);
    expect(text(join(d, 'notes.md.html')) === assemble(t)).toBe(true);
    expect(json(r)).toEqual({ ok: true, command: 'new', file: join(d, 'notes.md'), html: join(d, 'notes.md.html'), kind: 'md', format: 1, uid: h.fields['uid'], title: 'My notes', theme: 'dark-elegant-1', sha256: sha256(t), delivery: 'inline', shell: VERSION, backups: [], warnings: [] });
    // a second one has another uid; --cdn for its file
    expect((await cli(['new', 'two.md', '--html', '--cdn'], d)).code).toBe(0);
    const two = text(join(d, 'two.md'));
    expect(readHeader(two)!.fields['uid']).not.toBe(h.fields['uid']);
    expect(text(join(d, 'two.md.html'))).toBe(assemble(two, { delivery: 'cdn' }));
    // no file: the text on stdout (and in --json)
    const s = await cli(['new', '--title', 'Out'], d);
    expect(s.code).toBe(0);
    expect(readHeader(s.stdout)!.fields['title']).toBe('Out');
    expect(lintHeader(s.stdout, 'md')).toEqual([]);
    const sj = json(await cli(['new', '--json'], d));
    expect(sj.file).toBeNull();
    expect(readHeader(sj.text as string)!.fields['carrier']).toBe('md');
    // refusals: an existing file (untouched), a bad theme or measure, another kind's name, --html without a file
    const before = bytes(join(d, 'notes.md'));
    const again = await cli(['new', 'notes.md', '--json'], d);
    expect(again.code).toBe(1);
    expect(json(again)).toMatchObject({ ok: false, command: 'new' });
    expect(String(json(again).error)).toMatch(/already exists.*--force/);
    expect(json(again).reason).toBe('exists');
    expect(bytes(join(d, 'notes.md')).equals(before)).toBe(true);
    // --force keeps every replaced file as <file>~ (round 2, F2): the text twin and, with --html, its file
    const beforeHtml = bytes(join(d, 'notes.md.html'));
    const forced = await cli(['new', 'notes.md', '--html', '--force', '--json'], d);
    expect(forced.code, forced.stdout).toBe(0);
    expect(json(forced).backups).toEqual([join(d, 'notes.md~'), join(d, 'notes.md.html~')]);
    expect(bytes(join(d, 'notes.md')).equals(before)).toBe(false);
    expect(bytes(join(d, 'notes.md~')).equals(before)).toBe(true);
    expect(bytes(join(d, 'notes.md.html~')).equals(beforeHtml)).toBe(true);
    expect((json(forced).warnings as string[]).join('\n')).toMatch(/kept as .*notes\.md~[\s\S]*kept as .*notes\.md\.html~/);
    const bad = await cli(['new', 'bad.md', '--theme', 'no-such'], d);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/unknown theme.*light-neat-3/);
    expect(existsSync(join(d, 'bad.md'))).toBe(false);
    expect((await cli(['new', 'bad.md', '--measure', 'huge'], d)).code).toBe(2);
    expect((await cli(['new', 'deck.slides.md'], d)).stderr).toMatch(/orz-slides/);
    expect((await cli(['new', 'notes.txt'], d)).code).toBe(2);
    expect((await cli(['new', '--html'], d)).code).toBe(2);
    noTemp(d);
  }, 120_000);

  it('[T.3] extract writes the exact text twin (new → CR LF + BOM on disk → assemble → extract: byte for byte); a 0.x file is refused with upgrade advice', async () => {
    const d = folder();
    expect((await cli(['new', 'doc.md', '--title', 'Round trip'], d)).code).toBe(0);
    // the author's editor saved it with CR LF and a BOM
    const crlf = `\uFEFF${text(join(d, 'doc.md')).replace(/\n/g, '\r\n')}`;
    write(join(d, 'doc.md'), crlf);
    const original = bytes(join(d, 'doc.md'));
    expect(original.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
    for (const delivery of [[], ['--cdn']]) {
      expect((await cli(['assemble', 'doc.md', '--force', ...delivery], d)).code).toBe(0);
      rmSync(join(d, 'doc.md'));
      const r = await cli(['extract', 'doc.md.html', '--json'], d);
      expect(r.code, r.stdout).toBe(0);
      expect(bytes(join(d, 'doc.md')).equals(original)).toBe(true);
      expect(json(r)).toMatchObject({ ok: true, command: 'extract', output: join(d, 'doc.md'), kind: 'md', format: 1, shell: VERSION, delivery: delivery.length ? 'cdn' : 'inline', title: 'Round trip', includes: 0, bytes: original.length, warnings: [] });
    }
    // -o elsewhere and -o - (stdout), the text exact
    expect((await cli(['extract', 'doc.md.html', '-o', 'copy.md'], d)).code).toBe(0);
    expect(bytes(join(d, 'copy.md')).equals(original)).toBe(true);
    expect((await cliBytes(['extract', 'doc.md.html', '-o', '-'], d)).equals(original)).toBe(true);
    // includes come back as the file holds them (and the text exact)
    write(join(d, 'inc.md.html'), assemble(HAZARDS['crlf-header']!, { includes: { './a.md': 'A\r\n' } }));
    const inc = await cli(['extract', 'inc.md.html', '--json'], d);
    expect(json(inc).includes).toBe(1);
    expect(text(join(d, 'inc.md')) === HAZARDS['crlf-header']).toBe(true);
    // a 0.x file: refused, advice to upgrade, nothing written
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      const file = join(d, `legacy-${name.replace(/\W+/g, '-')}.md.html`);
      write(file, read(path));
      const r = await cli(['extract', file], d);
      expect(r.code, name).toBe(1);
      expect(r.stderr).toMatch(/before text format 1.*orz-mdhtml upgrade/);
      expect(existsSync(file.replace(/\.html$/, ''))).toBe(false);
    }
    // an island without #orz-shell (an unknown writer): extracted with a warning
    write(join(d, 'foreign.md.html'), '<!doctype html><html><body><script type="text/markdown" id="orz-src"># foreign\n</script></body></html>');
    const foreign = await cli(['extract', 'foreign.md.html', '--json'], d);
    expect(foreign.code).toBe(0);
    expect((json(foreign).warnings as string[]).join('\n')).toMatch(/no #orz-shell: an unknown writer/);
    expect(text(join(d, 'foreign.md'))).toBe('# foreign\n');
    // a file cut off inside its island: extracted (exit 0) with a warning that the text may be incomplete
    const whole = assemble('# Cut\n\nfirst part\n\nsecond part\n', { delivery: 'cdn' });
    write(join(d, 'cut.md.html'), whole.slice(0, whole.indexOf('second part') + 6));
    const cut = await cli(['extract', 'cut.md.html', '--json'], d);
    expect(cut.code).toBe(0);
    expect((json(cut).warnings as string[]).join('\n')).toMatch(/cut off.*may be incomplete/);
    const cutHuman = await cli(['extract', 'cut.md.html', '-o', 'cut2.md'], d);
    expect(cutHuman.stderr).toMatch(/warning: .*cut off/);
    // not an orz file
    write(join(d, 'plain.md.html'), '<!doctype html><title>x</title><p>hello</p>');
    const plain = await cli(['extract', 'plain.md.html', '--json'], d);
    expect(plain.code).toBe(1);
    expect(json(plain)).toMatchObject({ ok: false, command: 'extract' });
    noTemp(d);
  }, 120_000);

  it('[T.4] upgrade writes a 0.x file\'s new file in place and its text twin (= the library\'s upgrade), keeps its delivery, re-assembles an older format-1 shell; refuses a different existing twin', async () => {
    const d = folder();
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      const old = read(path);
      const base = `old-${name.replace(/\W+/g, '-')}`;
      const file = join(d, `${base}.md.html`);
      write(file, old);
      const r = await cli(['upgrade', `${base}.md.html`, '--json'], d);
      expect(r.code, r.stdout).toBe(0);
      const j = json(r);
      const twin = text(join(d, `${base}.md`));
      const lib = upgrade(old, { uid: j.uid as string, delivery: j.delivery as 'inline' | 'cdn' });
      expect(twin === lib.text, name).toBe(true);
      expect(text(file) === lib.html, name).toBe(true);
      expect(extract(text(file))!.text === twin).toBe(true);
      expect(j).toMatchObject({ ok: true, command: 'upgrade', input: file, output: file, text: join(d, `${base}.md`), from: 'legacy', shell: VERSION, moved: lib.moved, notes: lib.notes });
      expect(j.delivery).toBe(/data-orz-asset="engine" src=/.test(old) ? 'cdn' : 'inline');
      expect(inspect(text(file)).input).toBe('assembled');
      // twice: a format-1 file of this shell, the text unchanged
      const again = await cli(['upgrade', `${base}.md.html`, '--inline', '--json'], d);
      expect(again.code, again.stdout).toBe(0);
      expect(json(again).from).toBe('format-1');
      expect(text(file) === assemble(twin)).toBe(true);
    }
    // an older format-1 shell is re-assembled with this one (text and includes unchanged)
    const t = HAZARDS['bom-crlf']!;
    const older = assemble(t, { delivery: 'cdn', includes: { './x.md': 'X\n' } }).split(`"shell":"${VERSION}"`).join('"shell":"0.0.1"');
    expect(extract(older)!.shell).toBe('0.0.1');
    write(join(d, 'older.md.html'), older);
    const o = await cli(['upgrade', 'older.md.html', '-o', 'newer.md.html', '--text', 'newer-text.md', '--json'], d);
    expect(o.code, o.stdout).toBe(0);
    expect(json(o)).toMatchObject({ from: 'format-1', previous: '0.0.1', delivery: 'cdn' });
    expect(text(join(d, 'newer.md.html'))).toBe(assemble(t, { delivery: 'cdn', includes: { './x.md': 'X\n' } }));
    expect(text(join(d, 'newer-text.md')) === t).toBe(true);
    expect(text(join(d, 'older.md.html'))).toBe(older); // -o: the input is left alone
    // an existing, different text twin: refused before anything is written
    const legacy = read(LEGACY_FILES['fixtures/sample.md.html']!);
    write(join(d, 'kept.md.html'), legacy);
    write(join(d, 'kept.md'), '# my own newer text\n');
    const refused = await cli(['upgrade', 'kept.md.html'], d);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/kept\.md exists and holds a different text/);
    expect(text(join(d, 'kept.md.html'))).toBe(legacy);
    expect(text(join(d, 'kept.md'))).toBe('# my own newer text\n');
    expect((await cli(['upgrade', 'kept.md.html', '--no-text'], d)).code).toBe(0);
    expect(text(join(d, 'kept.md'))).toBe('# my own newer text\n');
    expect(inspect(text(join(d, 'kept.md.html'))).input).toBe('assembled');
    // not an orz file
    write(join(d, 'plain.html'), '<!doctype html><p>x</p>');
    expect((await cli(['upgrade', 'plain.html', '--no-text'], d)).code).toBe(1);
    noTemp(d);
  }, 120_000);

  it('[T.5] inspect is human-readable by default (golden) and --json prints the library\'s inspect report', async () => {
    const d = folder();
    const files: Array<[string, string]> = [
      ...Object.entries(LEGACY_FILES).map(([k, p]) => [`legacy-${k.replace(/\W+/g, '-')}.md.html`, read(p)] as [string, string]),
      ['assembled.md.html', assemble(HAZARDS['crlf-header']!, { delivery: 'cdn', includes: { './a.md': 'A\n' } })],
      ['twin.md', HAZARDS['crlf-header']!],
      ['deck.slides.md', '# a slide\n'],
      ['page.html', '<!doctype html><title>x</title>'],
    ];
    for (const [name, content] of files) {
      write(join(d, name), content);
      const r = await cli(['inspect', name, '--json'], d);
      expect(r.code, name).toBe(0);
      expect(json(r), name).toEqual(JSON.parse(JSON.stringify(inspect(content, { filename: name }))));
      const h = await cli(['inspect', name], d);
      expect(h.code).toBe(0);
      expect(h.stdout).toMatch(new RegExp(`^file\\s+${name.replace(/\./g, '\\.')}\\ninput\\s+`));
    }
    const human = (await cli(['inspect', 'legacy-fixtures-sample-md-html.md.html'], d)).stdout;
    expect(golden(human)).toBe(read(`${GOLDEN}/inspect-legacy.txt`));
    expect(golden((await cli(['inspect', 'assembled.md.html'], d)).stdout)).toBe(read(`${GOLDEN}/inspect-assembled.txt`));
  }, 120_000);

  it('[T.6] every command: --help, --version, --json results that parse, exit 0 / 1 / 2; assemble has no content options (a clear message, nothing written)', async () => {
    const d = folder();
    await Promise.all(['new', 'assemble', 'extract', 'upgrade', 'inspect', 'themes'].flatMap((c) => [[c, '--help'], [c, '-h'], ['help', c]].map(async (args) => {
      const r = await cli(args, d);
      expect(r.code, args.join(' ')).toBe(0);
      expect(r.stdout.startsWith(`orz-mdhtml ${c} `), args.join(' ')).toBe(true);
    })));
    const help = await cli(['--help'], d);
    expect(help.code).toBe(0);
    expect(golden(help.stdout)).toBe(read(`${GOLDEN}/help.txt`));
    const none = await cli([], d);
    expect(none.code).toBe(2);
    expect(none.stderr).toContain('Usage:');
    expect((await cli(['--version'], d)).stdout).toBe(`orz-mdhtml ${VERSION} (orz-markdown ${ORZ_MARKDOWN_VERSION}, text format 1)\n`);
    expect(json(await cli(['--version', '--json'], d))).toEqual({ name: 'orz-mdhtml', version: VERSION, orzMarkdown: ORZ_MARKDOWN_VERSION, formats: [1] });
    const themes = json(await cli(['themes', '--json'], d)).themes as Array<{ id: string; default: boolean }>;
    expect(themes).toEqual(THEMES.map((t) => ({ ...t, default: t.id === DEFAULT_THEME })));
    expect(themes.filter((t) => t.default).map((t) => t.id)).toEqual([DEFAULT_THEME]);
    expect((await cli(['themes'], d)).stdout).toMatch(new RegExp(`^${DEFAULT_THEME} .*\\[default\\]$`, 'm'));
    // failures: 1 (missing file, refused), 2 (usage); --json gives {ok: false} on stdout
    const missing = await cli(['assemble', 'nope.md', '--json'], d);
    expect(missing.code).toBe(1);
    expect(json(missing)).toEqual({ ok: false, command: 'assemble', error: `${join(d, 'nope.md')}: no such file`, reason: 'no-such-file', exitCode: 1 });
    expect((await cli(['extract', 'nope.md.html'], d)).code).toBe(1);
    expect((await cli(['inspect', 'nope'], d)).code).toBe(1);
    write(join(d, 'doc.md'), '# Doc\n');
    write(join(d, 'bad-utf8.md'), '');
    writeFileSync(join(d, 'bad-utf8.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
    expect((await cli(['assemble', 'bad-utf8.md'], d)).stderr).toMatch(/not valid UTF-8/);
    const unknown = await cli(['assemble', 'doc.md', '--frobnicate', '--json'], d);
    expect(unknown.code).toBe(2);
    expect(json(unknown)).toMatchObject({ ok: false, exitCode: 2 });
    expect((await cli(['assemble', 'doc.md', 'other.md'], d)).code).toBe(2);
    expect((await cli(['assemble', 'doc.md', '--cdn', '--inline'], d)).code).toBe(2);
    expect((await cli(['assemble', 'doc.md', '-o'], d)).code).toBe(2);
    // content options are gone from assemble: a clear message, exit 2, nothing written
    for (const [flag, value] of [['--theme', 'dark-elegant-1'], ['--title', 'T'], ['--measure', 'wide'], ['--lang', 'de']]) {
      for (const args of [['assemble', 'doc.md', flag!, value!], ['doc.md', flag!, value!]]) {
        const r = await cli(args, d);
        expect(r.code, args.join(' ')).toBe(2);
        expect(r.stderr).toContain(`${flag} is not an assemble option`);
        expect(r.stderr).toMatch(/header/);
        expect(existsSync(join(d, 'doc.md.html'))).toBe(false);
      }
    }
    // an assembled file given to assemble, another kind, a header saying another carrier without a name
    expect((await cli(['assemble', 'doc.md'], d)).code).toBe(0);
    expect((await cli(['assemble', 'doc.md.html'], d)).stderr).toMatch(/is an assembled file.*extract/);
    write(join(d, 'deck.slides.md'), '# s\n');
    expect((await cli(['assemble', 'deck.slides.md'], d)).stderr).toMatch(/orz-slides/);
    write(join(d, 'noext'), '# x\n');
    expect((await cli(['assemble', 'noext'], d)).code).toBe(2);
    expect((await cli(['assemble', 'noext', '-o', 'noext.md.html'], d)).code).toBe(0);
    // a newer text format is refused
    write(join(d, 'newer.md'), '{{nyml\nkind: document\nformat: 2\n}}\n\nx\n');
    const newer = await cli(['assemble', 'newer.md', '--json'], d);
    expect(newer.code).toBe(1);
    expect(String(json(newer).error)).toMatch(/format/);
    // header lint warnings are reported, the file still written
    write(join(d, 'lint.md'), '{{nyml\nkind: document\nuid: not-a-uid\n}}\n\nx\n');
    const lint = await cli(['assemble', 'lint.md', '--json'], d);
    expect(lint.code).toBe(0);
    expect((json(lint).warnings as string[]).length).toBeGreaterThan(0);
  }, 120_000);

  it('[T.7] nothing is overwritten that could lose work unless --force (which keeps <file>~): assemble keeps a non-orz output and a .md.html holding a different text — however the times compare; extract keeps a newer, different twin; the output never replaces the input', async () => {
    const d = folder();
    write(join(d, 'a.md'), '# A\n');
    // a non-orz output
    write(join(d, 'a.md.html'), '<!doctype html><p>someone else\'s page</p>');
    const r1 = await cli(['assemble', 'a.md'], d);
    expect(r1.code).toBe(1);
    expect(r1.stderr).toMatch(/not an orz file/);
    expect(text(join(d, 'a.md.html'))).toMatch(/someone else/);
    const f1 = await cli(['assemble', 'a.md', '--force', '--json'], d);
    expect(f1.code).toBe(0);
    expect(text(join(d, 'a.md.html'))).toBe(assemble('# A\n'));
    expect(text(join(d, 'a.md.html~'))).toMatch(/someone else/); // the replaced file is kept
    expect(json(f1)).toMatchObject({ backup: join(d, 'a.md.html~') });
    expect((json(f1).warnings as string[]).join('\n')).toMatch(/kept as .*a\.md\.html~/);

    // the agent workflow (round 1, HIGH): new --html; a browser save adds text to the file; the agent edits the
    // text twin afterwards (so the twin is the NEWER file); assemble must not throw the browser's work away
    const w = folder();
    expect((await cli(['new', 'doc.md', '--html'], w)).code).toBe(0);
    const made = text(join(w, 'doc.md'));
    write(join(w, 'doc.md.html'), assemble(`${made}\nBROWSER WORK\n`));
    touch(join(w, 'doc.md.html'), 1_700_000_100);
    write(join(w, 'doc.md'), `${made}\nagent line\n`);
    touch(join(w, 'doc.md'), 1_700_000_200);
    const insp = json(await cli(['inspect', 'doc.md', '--json'], w));
    expect(insp.twin).toEqual({ name: 'doc.md.html', holds: 'different', newer: 'input', sha256: sha256(extract(text(join(w, 'doc.md.html')))!.text) });
    expect((insp.advice as string[]).join('\n')).toMatch(/doc\.md\.html holds a different text.*orz-mdhtml extract doc\.md\.html/);
    const refused = await cli(['assemble', 'doc.md', '--json'], w);
    expect(refused.code).toBe(1);
    expect(String(json(refused).error)).toMatch(/doc\.md\.html holds a different text than doc\.md — not its last commit, nor the text orz-mdhtml last wrote there; not replaced.*orz-mdhtml extract doc\.md\.html -o doc\.browser\.md.*--force.*doc\.md\.html~/);
    expect(extract(text(join(w, 'doc.md.html')))!.text).toContain('BROWSER WORK');
    // the way out the message names: extract, merge, assemble --force (the old file kept)
    expect((await cli(['extract', 'doc.md.html', '-o', 'doc.browser.md'], w)).code).toBe(0);
    expect(text(join(w, 'doc.browser.md'))).toContain('BROWSER WORK');
    const merged = `${made}\nBROWSER WORK\n\nagent line\n`;
    write(join(w, 'doc.md'), merged);
    expect((await cli(['assemble', 'doc.md', '--force'], w)).code).toBe(0);
    expect(extract(text(join(w, 'doc.md.html')))!.text).toBe(merged);
    expect(extract(text(join(w, 'doc.md.html~')))!.text).toContain('BROWSER WORK');
    // in step again: assembling the same text needs nothing (whatever the times)
    touch(join(w, 'doc.md.html'), 1_700_000_900);
    expect((await cli(['assemble', 'doc.md'], w)).code).toBe(0);
    // the browser-newer case is refused as before
    write(join(w, 'doc.md.html'), assemble('# edited in the browser\n'));
    touch(join(w, 'doc.md'), 1_700_001_000);
    touch(join(w, 'doc.md.html'), 1_700_001_100);
    const r2 = await cli(['assemble', 'doc.md', '--json'], w);
    expect(r2.code).toBe(1);
    expect(String(json(r2).error)).toMatch(/holds a different text than doc\.md and was changed after it.*orz-mdhtml extract/);
    noTemp(w);

    // mixed line endings are stored in one style: assembling twice is not a "different text" (round 1, A#4)
    const e = folder();
    writeFileSync(join(e, 'm.md'), 'a\r\nb\nc\n');
    expect((await cli(['assemble', 'm.md'], e)).code).toBe(0);
    const again = await cli(['assemble', 'm.md', '--json'], e);
    expect(again.code, again.stdout).toBe(0);
    expect(json(again).backup).toBeNull();
    expect(extract(text(join(e, 'm.md.html')))!.text).toBe('a\r\nb\r\nc\r\n');

    // extract keeps a text twin that differs and is not a known state — WHICHEVER file is newer (round 2, HIGH)
    write(join(d, 'a.md.html'), assemble('# A from the browser\n'));
    write(join(d, 'a.md'), '# A edited as text\n');
    touch(join(d, 'a.md.html'), 1_700_000_400);
    touch(join(d, 'a.md'), 1_700_000_500);
    const r3 = await cli(['extract', 'a.md.html'], d);
    expect(r3.code).toBe(1);
    expect(r3.stderr).toMatch(/a\.md exists and holds a different text, changed after a\.md\.html.*not overwritten.*orz-mdhtml extract a\.md\.html -o a\.browser\.md/);
    expect(text(join(d, 'a.md'))).toBe('# A edited as text\n');
    touch(join(d, 'a.md'), 1_700_000_300); // the twin is now the OLDER file: still refused (an mtime proves nothing)
    const r4 = await cli(['extract', 'a.md.html', '--json'], d);
    expect(r4.code).toBe(1);
    expect(json(r4)).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['a.md.html', '-o', 'a.browser.md'] } });
    expect(text(join(d, 'a.md'))).toBe('# A edited as text\n');
    expect((await cli(['extract', 'a.md.html', '--force'], d)).code).toBe(0);
    expect(text(join(d, 'a.md'))).toBe('# A from the browser\n');
    expect(text(join(d, 'a.md~'))).toBe('# A edited as text\n');

    // the round-2 repro: new --html; the agent appends to x.md; the browser saves x.md.html; assemble refuses and
    // names extract -o x.browser.md; a plain extract must not overwrite the agent's x.md (it did: ok, no backup)
    const x = folder();
    expect((await cli(['new', 'x.md', '--html'], x)).code).toBe(0);
    const base = text(join(x, 'x.md'));
    write(join(x, 'x.md'), `${base}agent line\n`);
    write(join(x, 'x.md.html'), assemble(`${base}browser line\n`));
    const refusedAssemble = await cli(['assemble', 'x.md', '--json'], x);
    expect(json(refusedAssemble)).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['x.md.html', '-o', 'x.browser.md'] } });
    const refusedExtract = await cli(['extract', 'x.md.html', '--json'], x);
    expect(refusedExtract.code).toBe(1);
    expect(json(refusedExtract)).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['x.md.html', '-o', 'x.browser.md'] } });
    expect(text(join(x, 'x.md'))).toBe(`${base}agent line\n`);
    expect(existsSync(join(x, 'x.md~'))).toBe(false);
    // the way out it names: extract to x.browser.md, merge
    expect((await cli(['extract', 'x.md.html', '-o', 'x.browser.md'], x)).code).toBe(0);
    expect(text(join(x, 'x.browser.md'))).toBe(`${base}browser line\n`);
    // an unchanged twin (the text orz-mdhtml last wrote or read for the pair) is replaced without --force
    const y = folder();
    expect((await cli(['new', 'y.md', '--html'], y)).code).toBe(0);
    const yBase = text(join(y, 'y.md'));
    write(join(y, 'y.md.html'), assemble(`${yBase}saved in the browser\n`));
    const pulled = await cli(['extract', 'y.md.html', '--json'], y);
    expect(pulled.code, pulled.stdout).toBe(0);
    expect(json(pulled)).toMatchObject({ replaced: 'cache', backup: null });
    expect(text(join(y, 'y.md'))).toBe(`${yBase}saved in the browser\n`);
    noTemp(x);
    // the output never replaces the input
    expect((await cli(['assemble', 'a.md', '-o', 'a.md'], d)).code).toBe(2);
    expect((await cli(['extract', 'a.md.html', '-o', 'a.md.html'], d)).code).toBe(2);
    noTemp(d);
  }, 120_000);

  it('[T.11] the smoother assemble rule: a .md.html holding an earlier state of its twin — the text the CLI last wrote or read for the pair (new --html, assemble, extract, upgrade), or the twin\'s last commit, staged version or one of its recent commits in git — is replaced without --force; a browser save in between is still refused; mixed line endings compare as stored, with and without a cache; the cache lives under $XDG_CACHE_HOME', async () => {
    // after new --html: edit the twin, assemble — no --force, no backup
    const d = folder();
    expect((await cli(['new', 'doc.md', '--html'], d)).code).toBe(0);
    const made = text(join(d, 'doc.md'));
    write(join(d, 'doc.md'), `${made}\nfirst edit\n`);
    const r1 = await cli(['assemble', 'doc.md', '--json'], d);
    expect(r1.code, r1.stdout).toBe(0);
    expect(json(r1)).toMatchObject({ backup: null, replaced: 'cache' });
    expect(extract(text(join(d, 'doc.md.html')))!.text).toBe(`${made}\nfirst edit\n`);
    expect(existsSync(join(d, 'doc.md.html~'))).toBe(false);
    // after a previous assemble: again (the human output says why)
    write(join(d, 'doc.md'), `${made}\nsecond edit\n`);
    const r2 = await cli(['assemble', 'doc.md'], d);
    expect(r2.code, r2.stderr).toBe(0);
    expect(r2.stdout).toMatch(/it held an earlier text of doc\.md: the text orz-mdhtml last wrote or read for this pair/);
    // inspect says so too
    write(join(d, 'doc.md'), `${made}\nthird edit\n`);
    const insp = json(await cli(['inspect', 'doc.md', '--json'], d));
    expect(insp.twin).toMatchObject({ name: 'doc.md.html', holds: 'different', earlier: 'cache' });
    expect((insp.advice as string[]).join('\n')).toMatch(/doc\.md\.html holds an earlier text of this text twin.*orz-mdhtml assemble doc\.md`.*no --force needed/);
    expect((await cli(['assemble', 'doc.md'], d)).code).toBe(0);
    // after extract (the CLI read the file): edit the twin, assemble
    write(join(d, 'doc.md.html'), assemble(`${made}\nsaved in the browser\n`));
    touch(join(d, 'doc.md'), 1_700_000_000);
    expect((await cli(['extract', 'doc.md.html'], d)).code).toBe(0);
    write(join(d, 'doc.md'), `${made}\nsaved in the browser\nthen edited as text\n`);
    expect((await cli(['assemble', 'doc.md'], d)).code).toBe(0);
    expect(extract(text(join(d, 'doc.md.html')))!.text).toBe(`${made}\nsaved in the browser\nthen edited as text\n`);
    // the cache is a record per pair under $XDG_CACHE_HOME/orz-mdhtml (here the test's own), never the user's
    expect(readdirSync(join(CACHE, 'orz-mdhtml', 'pairs')).length).toBeGreaterThan(0);

    // the HIGH repro: new --html, a browser save adds work to the file, the agent edits the twin → still refused
    const h = folder();
    expect((await cli(['new', 'doc.md', '--html'], h)).code).toBe(0);
    const base = text(join(h, 'doc.md'));
    write(join(h, 'doc.md.html'), assemble(`${base}\nBROWSER WORK\n`));
    write(join(h, 'doc.md'), `${base}\nagent line\n`);
    const refused = await cli(['assemble', 'doc.md', '--json'], h);
    expect(refused.code).toBe(1);
    expect(String(json(refused).error)).toMatch(/holds a different text than doc\.md.*not replaced/);
    expect(extract(text(join(h, 'doc.md.html')))!.text).toContain('BROWSER WORK');
    // a browser save that happens after an assemble: refused too (the record holds the CLI's text, not the browser's)
    write(join(h, 'doc.md'), `${base}\nBROWSER WORK\n\nagent line\n`);
    expect((await cli(['assemble', 'doc.md', '--force'], h)).code).toBe(0);
    write(join(h, 'doc.md.html'), assemble(`${base}\nBROWSER WORK\n\nagent line\nmore browser work\n`));
    write(join(h, 'doc.md'), `${base}\nBROWSER WORK\n\nagent line\nanother agent line\n`);
    expect((await cli(['assemble', 'doc.md'], h)).code).toBe(1);
    // another cache (another user, a cleared cache): nothing is known, refused
    const fresh = folder();
    write(join(fresh, 'doc.md'), '# A\n');
    expect((await cli(['assemble', 'doc.md'], fresh)).code).toBe(0);
    write(join(fresh, 'doc.md'), '# A\n\nedited\n');
    expect((await cli(['assemble', 'doc.md'], fresh, { XDG_CACHE_HOME: join(fresh, 'other-cache') })).code).toBe(1);

    // upgrade records the pair (round 2, M06): upgrade a 0.x file, edit the text twin, assemble — no --force
    const u = folder();
    write(join(u, 'old.md.html'), read(LEGACY_FILES['fixtures/sample.md.html']!));
    expect((await cli(['upgrade', 'old.md.html'], u)).code).toBe(0);
    write(join(u, 'old.md'), `${text(join(u, 'old.md'))}\nedited after the upgrade\n`);
    const afterUpgrade = await cli(['assemble', 'old.md', '--json'], u);
    expect(afterUpgrade.code, afterUpgrade.stdout).toBe(0);
    expect(json(afterUpgrade)).toMatchObject({ replaced: 'cache', backup: null });

    // mixed line endings (round 2, M08/M09): the record holds the STORED text (one style), so assembling an edited
    // mixed text after a mixed one needs nothing; and the same text assembles twice with no cache at all
    const m = folder();
    writeFileSync(join(m, 'm.md'), 'a\r\nb\nc\n');
    expect((await cli(['assemble', 'm.md'], m)).code).toBe(0);
    writeFileSync(join(m, 'm.md'), 'a\r\nb\nc\nd\n');
    const mixed = await cli(['assemble', 'm.md', '--json'], m);
    expect(mixed.code, mixed.stdout).toBe(0);
    expect(json(mixed)).toMatchObject({ replaced: 'cache' });
    for (const env of [{ XDG_CACHE_HOME: join(m, 'empty-1') }, { XDG_CACHE_HOME: join(m, 'empty-2') }]) {
      const again = await cli(['assemble', 'm.md', '--json'], m, env); // a fresh cache each run: only the same-text rule can allow it
      expect(again.code, again.stdout).toBe(0);
      expect(json(again)).toMatchObject({ replaced: null, backup: null });
    }

    // git: a file holding the twin's last commit (or its staged version) is replaced without --force — with no cache at all
    const g = folder();
    const git = (...args: string[]): Promise<Run> => new Promise((res) => execFile('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: g }, (e, stdout, stderr) => res({ code: e ? 1 : 0, stdout, stderr })));
    if ((await git('init', '-q')).code !== 0) return; // no git on this machine: nothing more to show
    let caches = 0;
    const noCache = (): NodeJS.ProcessEnv => ({ XDG_CACHE_HOME: join(tmp, `.empty-cache-${++caches}`) }); // a fresh, empty cache each run: only git can know
    write(join(g, 'doc.md'), '# Committed\r\n\nline\n'); // mixed line endings: compared as a file stores them
    expect((await git('add', 'doc.md')).code).toBe(0);
    expect((await git('commit', '-q', '-m', 'doc')).code).toBe(0);
    write(join(g, 'doc.md.html'), assemble('# Committed\r\n\nline\n')); // assembled by anyone (no record)
    write(join(g, 'doc.md'), '# Committed\r\n\nline\nedited after the commit\n');
    const c1 = await cli(['assemble', 'doc.md', '--json'], g, noCache());
    expect(c1.code, c1.stdout).toBe(0);
    expect(json(c1)).toMatchObject({ backup: null, replaced: 'git-head' });
    // the staged version counts too
    expect((await git('add', 'doc.md')).code).toBe(0);
    write(join(g, 'doc.md'), '# Committed\r\n\nline\nedited after the commit\nand after staging\n');
    const c2 = await cli(['assemble', 'doc.md', '--json'], g, noCache());
    expect(c2.code, c2.stdout).toBe(0);
    expect(json(c2)).toMatchObject({ replaced: 'git-index' });
    // a browser save on top of the committed state: neither commit, index nor record → refused
    write(join(g, 'doc.md.html'), assemble('# Committed\r\n\nline\nBROWSER WORK\n'));
    write(join(g, 'doc.md'), '# Committed\r\n\nline\nagent work\n');
    expect((await cli(['assemble', 'doc.md'], g, noCache())).code).toBe(1);
    expect(extract(text(join(g, 'doc.md.html')))!.text).toContain('BROWSER WORK');
    // a fresh clone (no cache): the file holds an OLDER commit's text of doc.md (round 2, F4: git log -n 20 -- doc.md)
    expect((await git('commit', '-q', '-m', 'second')).code).toBe(0); // the staged version becomes a commit
    write(join(g, 'doc.md'), '# Committed\r\n\nline\nthird version\n');
    expect((await git('commit', '-q', '-am', 'third')).code).toBe(0);
    write(join(g, 'doc.md.html'), assemble('# Committed\r\n\nline\n')); // the first commit's text
    write(join(g, 'doc.md'), '# Committed\r\n\nline\nthird version\nand an edit\n');
    const c3 = await cli(['assemble', 'doc.md', '--json'], g, noCache());
    expect(c3.code, c3.stdout).toBe(0);
    expect(json(c3)).toMatchObject({ backup: null, replaced: 'git-log' });
    // extract: a twin whose text is a committed version is replaced without --force (its content is in the history)
    write(join(g, 'doc.md.html'), assemble('# Committed\r\n\nline\nthird version\nBROWSER\n'));
    write(join(g, 'doc.md'), '# Committed\r\n\nline\nthird version\n'); // = HEAD
    const e1 = await cli(['extract', 'doc.md.html', '--json'], g, noCache());
    expect(e1.code, e1.stdout).toBe(0);
    expect(json(e1)).toMatchObject({ replaced: 'git-head', backup: null });
    write(join(g, 'doc.md'), '# Committed\r\n\nline\n'); // = an older commit
    expect(json(await cli(['extract', 'doc.md.html', '--json'], g, noCache()))).toMatchObject({ ok: true, replaced: 'git-log' });
    write(join(g, 'doc.md'), '# Committed\r\n\nline\nnever committed\n');
    expect((await cli(['extract', 'doc.md.html'], g, noCache())).code).toBe(1);
    noTemp(g);
  }, 120_000);

  it('[T.8] assemble keeps the includes the existing file holds (unless --no-includes), --resolve-includes reads file includes from the text\'s folder only, and each unresolved directive is warned about once (the "Included file not available" note; the hint depends on --resolve-includes) and listed in --json unresolved', async () => {
    const d = folder();
    mkdirSync(join(d, 'parts'));
    write(join(d, 'parts', 'a.md'), 'PART A\r\n');
    write(join(d, 'outside.md'), 'OUTSIDE\n');
    const doc = '# Doc\n\n{{md parts/a.md}}\n\n{{md https://example.test/b.md}}\n';
    write(join(d, 'doc.md'), doc);
    // the existing file's record (a host or the library resolved them): kept by a plain assemble
    write(join(d, 'doc.md.html'), assemble(doc, { includes: { 'parts/a.md': 'OLD A\n', 'https://example.test/b.md': 'URL B\n', './gone.md': 'no longer included\n' } }));
    const kept = await cli(['assemble', 'doc.md', '--json'], d);
    expect(kept.code, kept.stdout).toBe(0);
    expect(extract(text(join(d, 'doc.md.html')))!.includes).toEqual({ 'parts/a.md': 'OLD A\n', 'https://example.test/b.md': 'URL B\n' }); // a removed directive's entry goes
    expect(json(kept)).toMatchObject({ includes: 2, resolved: 0, warnings: [] });
    // --resolve-includes: the file include is read afresh from the folder (exact text), the URL entry kept
    const res = await cli(['assemble', 'doc.md', '--resolve-includes', '--json'], d);
    expect(res.code, res.stdout).toBe(0);
    expect(extract(text(join(d, 'doc.md.html')))!.includes).toEqual({ 'parts/a.md': 'PART A\r\n', 'https://example.test/b.md': 'URL B\n' });
    expect(json(res)).toMatchObject({ includes: 2, resolved: 1 });
    expect(text(join(d, 'doc.md.html'))).toBe(assemble(doc, { includes: { 'https://example.test/b.md': 'URL B\n', 'parts/a.md': 'PART A\r\n' } }));
    // --no-includes drops the record: both directives are reported unresolved
    const none = await cli(['assemble', 'doc.md', '--no-includes', '--json'], d);
    expect(none.code).toBe(0);
    expect(extract(text(join(d, 'doc.md.html')))!.includes).toBeUndefined();
    const warned = (json(none).warnings as string[]).join('\n');
    expect(warned).toMatch(/\{\{md parts\/a\.md\}\} is not resolved: the file shows an "Included file not available" note there \(pass --resolve-includes/);
    expect(warned).toMatch(/\{\{md https:\/\/example\.test\/b\.md\}\} is not resolved: the file shows an "Included file not available" note there.*URL include/);
    expect(warned).not.toMatch(/shows nothing/);
    expect(json(none).unresolved).toEqual([{ target: 'parts/a.md', kind: 'file', reason: 'not-recorded' }, { target: 'https://example.test/b.md', kind: 'url', reason: 'url' }]);
    expect((await cli(['assemble', 'doc.md', '--no-includes', '--resolve-includes'], d)).code).toBe(2);
    // never outside the text's folder: ../, an absolute path, a symlink that leaves it
    const sub = join(d, 'sub');
    mkdirSync(sub);
    symlinkSync(join(d, 'outside.md'), join(sub, 'link.md'));
    write(join(sub, 'esc.md'), `# Esc\n\n{{md ../outside.md}}\n\n{{md ${join(d, 'outside.md')}}}\n\n{{md link.md}}\n\n{{md missing.md}}\n\n\`\`\`\n{{md ../outside.md}}\n\`\`\`\n`);
    const esc = await cli(['assemble', 'esc.md', '--resolve-includes', '--json'], sub);
    expect(esc.code, esc.stdout).toBe(0);
    expect(extract(text(join(sub, 'esc.md.html')))!.includes).toBeUndefined();
    const escWarnings = json(esc).warnings as string[];
    const escWarn = escWarnings.join('\n');
    expect(escWarn.match(/outside the text's folder/g)).toHaveLength(3);
    expect(escWarn).toMatch(/\{\{md missing\.md\}\} is not resolved: no such file .*"Included file not available" note/);
    // one warning per directive (no second "is not resolved" line after --resolve-includes), and no hint to pass the flag given
    expect(escWarnings.filter((w) => /is not resolved/.test(w))).toHaveLength(4);
    expect(escWarn).not.toMatch(/pass --resolve-includes/);
    expect(json(esc).unresolved).toEqual([
      { target: '../outside.md', kind: 'file', reason: 'outside-folder' },
      { target: join(d, 'outside.md'), kind: 'file', reason: 'outside-folder' },
      { target: 'link.md', kind: 'file', reason: 'outside-folder' },
      { target: 'missing.md', kind: 'file', reason: 'no-such-file' },
    ]);
    expect(json(esc)).toMatchObject({ includes: 0, resolved: 0 });
    expect(text(join(sub, 'esc.md.html'))).not.toContain('OUTSIDE');
    noTemp(d);
  }, 120_000);

  it('[T.9] writes go through a temporary file and a rename (none left), keep the replaced file\'s mode, and replace a symbolic link\'s target, not the link', async () => {
    const d = folder();
    write(join(d, 'w.md'), '# W\n');
    expect((await cli(['assemble', 'w.md'], d)).code).toBe(0);
    // a hard link to the old file keeps the old bytes: the new file is a new inode (rename), not a rewrite in place
    linkSync(join(d, 'w.md.html'), join(d, 'old-link.html'));
    const before = statSync(join(d, 'w.md.html')).ino;
    write(join(d, 'w.md'), '# W\n'); // same text: no refusal
    chmodSync(join(d, 'w.md.html'), 0o640);
    expect((await cli(['assemble', 'w.md', '--cdn'], d)).code).toBe(0);
    expect(statSync(join(d, 'w.md.html')).ino).not.toBe(before);
    expect(text(join(d, 'old-link.html'))).toBe(assemble('# W\n'));
    expect(text(join(d, 'w.md.html'))).toBe(assemble('# W\n', { delivery: 'cdn' }));
    expect(statSync(join(d, 'w.md.html')).mode & 0o777).toBe(0o640);
    // a symbolic link stays a link; the file it points to gets the new bytes, with its mode
    mkdirSync(join(d, 'real'));
    write(join(d, 'real', 'target.md.html'), assemble('# W\n'));
    chmodSync(join(d, 'real', 'target.md.html'), 0o600);
    symlinkSync(join(d, 'real', 'target.md.html'), join(d, 'linked.md.html'));
    write(join(d, 'linked.md'), '# W\n');
    expect((await cli(['assemble', 'linked.md', '--cdn'], d)).code).toBe(0);
    expect(lstatSync(join(d, 'linked.md.html')).isSymbolicLink()).toBe(true);
    expect(text(join(d, 'real', 'target.md.html'))).toBe(assemble('# W\n', { delivery: 'cdn' }));
    expect(statSync(join(d, 'real', 'target.md.html')).mode & 0o777).toBe(0o600);
    noTemp(d);
    noTemp(join(d, 'real'));
  }, 120_000);

  it('[T.10] neither upgrade nor assemble downgrades (a newer shell is refused unless --force, which warns and keeps <file>~); upgrade refuses a file cut off inside its text unless --force, keeps another document at -o, and never writes the text twin onto a file', async () => {
    const d = folder();
    const t = '# Up\n';
    const newer = assemble(t, { delivery: 'cdn' }).split(`"shell":"${VERSION}"`).join('"shell":"99.0.0"');
    write(join(d, 'newer.md.html'), newer);
    const r = await cli(['upgrade', 'newer.md.html', '--json'], d);
    expect(r.code).toBe(1);
    expect(String(json(r).error)).toMatch(/newer than this tool.*downgrade.*orz-mdhtml@latest.*--force/);
    expect(text(join(d, 'newer.md.html'))).toBe(newer);
    expect(existsSync(join(d, 'newer.md'))).toBe(false);
    expect(() => upgrade(newer)).toThrow(/downgrade/);
    expect(upgrade(newer, { delivery: 'cdn', downgrade: true }).html).toBe(assemble(t, { delivery: 'cdn' }));
    const forced = await cli(['upgrade', 'newer.md.html', '--force', '--json'], d);
    expect(forced.code, forced.stdout).toBe(0);
    expect(text(join(d, 'newer.md.html'))).toBe(assemble(t, { delivery: 'cdn' }));
    expect((json(forced).warnings as string[]).join('\n')).toMatch(/newer shell .*99\.0\.0/);
    expect(text(join(d, 'newer.md.html~'))).toBe(newer); // the newer file is kept
    expect(json(r)).toMatchObject({ reason: 'newer-shell' });
    // assemble over a file of a newer shell: refused (even for the same text), --force warns and keeps it (round 2, F3)
    write(join(d, 'up.md'), t);
    write(join(d, 'up.md.html'), newer);
    const a1 = await cli(['assemble', 'up.md', '--cdn', '--json'], d);
    expect(a1.code).toBe(1);
    expect(json(a1)).toMatchObject({ ok: false, reason: 'newer-shell' });
    expect(String(json(a1).error)).toMatch(/newer orz-mdhtml \(99\.0\.0\).*orz-mdhtml@latest.*--force/);
    expect(text(join(d, 'up.md.html'))).toBe(newer);
    const a2 = await cli(['assemble', 'up.md', '--cdn', '--force', '--json'], d);
    expect(a2.code, a2.stdout).toBe(0);
    expect(text(join(d, 'up.md.html'))).toBe(assemble(t, { delivery: 'cdn' }));
    expect(text(join(d, 'up.md.html~'))).toBe(newer);
    expect((json(a2).warnings as string[]).join('\n')).toMatch(/had a newer shell \(orz-mdhtml 99\.0\.0\); --force re-assembled it/);
    // a file cut off inside its #orz-src island: upgrade refuses (the text may be incomplete); --force keeps <file>~ (round 2, B#4)
    const whole = assemble('# Cut\n\nfirst part\n\nsecond part\n', { delivery: 'cdn' }).split(`"shell":"${VERSION}"`).join('"shell":"0.0.1"');
    const cutFile = whole.slice(0, whole.indexOf('second part') + 6);
    write(join(d, 'cut.md.html'), cutFile);
    const c1 = await cli(['upgrade', 'cut.md.html', '--no-text', '--json'], d);
    expect(c1.code).toBe(1);
    expect(json(c1)).toMatchObject({ ok: false, reason: 'unclosed-island', next: { command: 'extract', args: ['cut.md.html', '-o', 'cut.recovered.md'] } });
    expect(String(json(c1).error)).toMatch(/cut off.*may be incomplete/);
    expect(text(join(d, 'cut.md.html'))).toBe(cutFile);
    const c2 = await cli(['upgrade', 'cut.md.html', '--no-text', '--force', '--json'], d);
    expect(c2.code, c2.stdout).toBe(0);
    expect(text(join(d, 'cut.md.html~'))).toBe(cutFile);
    expect((json(c2).warnings as string[]).join('\n')).toMatch(/cut off.*may be incomplete/);
    // -o onto another document: refused; --force keeps it as <file>~
    write(join(d, 'src.md.html'), assemble('# Source\n', { delivery: 'cdn' }));
    write(join(d, 'other.md.html'), assemble('# Another document\n', { delivery: 'cdn' }));
    const o = await cli(['upgrade', 'src.md.html', '-o', 'other.md.html', '--no-text'], d);
    expect(o.code).toBe(1);
    expect(o.stderr).toMatch(/other\.md\.html exists and holds another text/);
    expect(extract(text(join(d, 'other.md.html')))!.text).toBe('# Another document\n');
    expect((await cli(['upgrade', 'src.md.html', '-o', 'other.md.html', '--no-text', '--force'], d)).code).toBe(0);
    expect(extract(text(join(d, 'other.md.html')))!.text).toBe('# Source\n');
    expect(extract(text(join(d, 'other.md.html~')))!.text).toBe('# Another document\n');
    // the text twin may not land on the file (in place or -o)
    expect((await cli(['upgrade', 'src.md.html', '--text', 'src.md.html'], d)).code).toBe(2);
    expect((await cli(['upgrade', 'src.md.html', '-o', 'x.md.html', '--text', 'x.md.html'], d)).code).toBe(2);
    expect(existsSync(join(d, 'x.md.html'))).toBe(false);
    noTemp(d);
  }, 120_000);

  it('[T.12] compare-and-swap for agents without a cache or history: inspect, extract and assemble report the SHA-256 of the text a file holds (for a text twin: of its exact bytes, as sha256sum); assemble --replaces <sha256> replaces a different .md.html only while its text has that hash, extract --replaces only an x.md with that hash; any other text is refused (replaces-mismatch, nothing written); a malformed token is a usage error', async () => {
    const d = folder();
    let k = 0;
    const fresh = (): NodeJS.ProcessEnv => ({ XDG_CACHE_HOME: join(d, `.cache-${++k}`) }); // a fresh sandbox every run
    const fileHash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
    const t = '\uFEFF# T\r\n\nbody\n';
    writeFileSync(join(d, 'x.md'), t);
    const a = await cli(['assemble', 'x.md', '--json'], d, fresh());
    expect(a.code, a.stdout).toBe(0);
    expect(json(a).sha256).toBe(sha256(storedText(t)));
    expect(sha256(t)).toBe(fileHash(join(d, 'x.md')));
    const it1 = json(await cli(['inspect', 'x.md', '--json'], d, fresh()));
    expect(it1.sha256).toBe(fileHash(join(d, 'x.md')));
    expect((it1.twin as { sha256: string }).sha256).toBe(json(a).sha256);
    const it2 = json(await cli(['inspect', 'x.md.html', '--json'], d, fresh()));
    expect(it2.sha256).toBe(json(a).sha256);
    expect((it2.twin as { sha256: string }).sha256).toBe(fileHash(join(d, 'x.md')));
    expect((await cli(['inspect', 'x.md'], d, fresh())).stdout).toMatch(new RegExp(`^sha256\\s+${it1.sha256 as string} `, 'm'));
    // a browser save; the agent (fresh sandbox) reads the token from inspect, merges, assembles with it
    write(join(d, 'x.md.html'), assemble('# T\r\n\nbody\r\nbrowser\r\n'));
    const token = (json(await cli(['inspect', 'x.md', '--json'], d, fresh())).twin as { sha256: string }).sha256;
    expect(token).toBe(sha256(storedText('# T\r\n\nbody\r\nbrowser\r\n')));
    const plain = await cli(['assemble', 'x.md', '--json'], d, fresh());
    expect(json(plain)).toMatchObject({ ok: false, reason: 'twin-differs' });
    expect(String(json(plain).error)).toContain(`--replaces ${token}`); // the refusal names the token
    writeFileSync(join(d, 'x.md'), '# T\r\n\nbody\r\nbrowser\r\nagent\r\n');
    const swapped = await cli(['assemble', 'x.md', '--replaces', token.toUpperCase(), '--json'], d, fresh());
    expect(swapped.code, swapped.stdout).toBe(0);
    expect(json(swapped)).toMatchObject({ replaced: 'token', backup: null, sha256: sha256(storedText('# T\r\n\nbody\r\nbrowser\r\nagent\r\n')) });
    // another browser save meanwhile: the stale token is refused, nothing written
    const another = assemble('# T\r\n\r\nother browser work\r\n');
    write(join(d, 'x.md.html'), another);
    writeFileSync(join(d, 'x.md'), '# T\r\n\nbody\r\nbrowser\r\nagent\r\nmore\r\n');
    const stale = await cli(['assemble', 'x.md', '--replaces', token, '--json'], d, fresh());
    expect(stale.code).toBe(1);
    expect(json(stale)).toMatchObject({ ok: false, reason: 'replaces-mismatch', next: { command: 'extract', args: ['x.md.html', '-o', 'x.browser.md'] } });
    expect(String(json(stale).error)).toContain(sha256('# T\r\n\r\nother browser work\r\n'));
    expect(text(join(d, 'x.md.html'))).toBe(another);
    // extract --replaces: only the x.md with that hash is replaced
    const mine = readFileSync(join(d, 'x.md'));
    const wrong = await cli(['extract', 'x.md.html', '--replaces', token, '--json'], d, fresh());
    expect(wrong.code).toBe(1);
    expect(json(wrong)).toMatchObject({ ok: false, reason: 'replaces-mismatch' });
    expect(readFileSync(join(d, 'x.md')).equals(mine)).toBe(true);
    const right = await cli(['extract', 'x.md.html', '--replaces', fileHash(join(d, 'x.md')), '--json'], d, fresh());
    expect(right.code, right.stdout).toBe(0);
    expect(json(right)).toMatchObject({ replaced: 'token', backup: null, sha256: sha256('# T\r\n\r\nother browser work\r\n') });
    expect(text(join(d, 'x.md'))).toBe('# T\r\n\r\nother browser work\r\n');
    // a malformed token
    const bad = await cli(['assemble', 'x.md', '--replaces', 'abc', '--json'], d, fresh());
    expect(bad.code).toBe(2);
    expect(json(bad)).toMatchObject({ ok: false, reason: 'bad-usage' });
    noTemp(d);
  }, 120_000);

  it('[T.13] machine-readable refusals: every --json failure has a stable reason code (bad-usage, no-such-file, not-utf8, exists, not-orz, twin-differs, output-differs, replaces-mismatch, legacy-file, newer-shell, newer-format, unclosed-island, other-kind, assembled-input, …) and, where a command resolves it, next: { command, args }', async () => {
    const d = folder();
    const fail = async (args: string[], reason: string, next?: { command: string; args: string[] }): Promise<void> => {
      const r = await cli([...args, '--json'], d);
      expect(r.code, args.join(' ')).toBe(reason === 'bad-usage' ? 2 : 1);
      const j = json(r);
      expect(j, args.join(' ')).toMatchObject({ ok: false, reason });
      expect(typeof j.error).toBe('string');
      if (next) expect(j.next, args.join(' ')).toEqual(next); else expect(j).not.toHaveProperty('next');
    };
    write(join(d, 'doc.md'), '# Doc\n');
    await fail(['assemble', 'doc.md', '--frobnicate'], 'bad-usage');
    await fail(['assemble', 'nope.md'], 'no-such-file');
    writeFileSync(join(d, 'bad.md'), Buffer.from([0x23, 0xff, 0x0a]));
    await fail(['assemble', 'bad.md'], 'not-utf8');
    await fail(['new', 'doc.md'], 'exists');
    write(join(d, 'doc.md.html'), '<!doctype html><p>a page</p>');
    await fail(['assemble', 'doc.md'], 'not-orz');
    await fail(['extract', 'doc.md.html'], 'not-orz', { command: 'inspect', args: ['doc.md.html'] });
    rmSync(join(d, 'doc.md.html'));
    write(join(d, 'other.md.html'), assemble('# Another document\n'));
    await fail(['assemble', 'doc.md', '-o', 'other.md.html'], 'output-differs', { command: 'extract', args: ['other.md.html', '-o', 'doc.browser.md'] });
    expect((await cli(['assemble', 'doc.md'], d)).code).toBe(0);
    await fail(['assemble', 'doc.md.html'], 'assembled-input', { command: 'extract', args: ['doc.md.html'] });
    write(join(d, 'deck.slides.md'), '# s\n');
    await fail(['assemble', 'deck.slides.md'], 'other-kind');
    write(join(d, 'newer.md'), '{{nyml\nkind: document\nformat: 2\n}}\n\nx\n');
    await fail(['assemble', 'newer.md'], 'newer-format');
    // a 0.x file: extract → upgrade; assembling a text over one → upgrade --text <x>.browser.md (round 2, B#3)
    const legacy = read(LEGACY_FILES['fixtures/sample.md.html']!);
    write(join(d, 'old.md.html'), legacy);
    await fail(['extract', 'old.md.html'], 'legacy-file', { command: 'upgrade', args: ['old.md.html'] });
    write(join(d, 'old.md'), '{{nyml\nkind: meta\ntitle: Old\n}}\n\n# my 0.x text, edited\n');
    await fail(['assemble', 'old.md'], 'legacy-file', { command: 'upgrade', args: ['old.md.html', '--text', 'old.browser.md'] });
    const lr = json(await cli(['assemble', 'old.md', '--json'], d));
    expect(String(lr.error)).toMatch(/legacy orz-mdhtml 0\.x file.*orz-mdhtml upgrade old\.md\.html --text old\.browser\.md.*merge/);
    expect(String(lr.error)).not.toMatch(/orz-mdhtml extract/);
    await fail(['upgrade', 'old.md.html'], 'twin-differs', { command: 'upgrade', args: ['old.md.html', '--text', 'old.browser.md'] });
    expect(text(join(d, 'old.md.html'))).toBe(legacy);
    // the advice works: upgrade --text old.browser.md, then the merge
    expect((await cli(['upgrade', 'old.md.html', '--text', 'old.browser.md'], d)).code).toBe(0);
    expect(text(join(d, 'old.browser.md'))).toMatch(/^\{\{nyml\nkind: document\n/);
    noTemp(d);
  }, 120_000);
});
