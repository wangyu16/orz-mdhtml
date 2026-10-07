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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintHeader, readHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { assemble, extract, inspect, readDocument, upgrade, ORZ_MARKDOWN_VERSION, THEMES, VERSION } from '../src/lib.js';
import { corpus, HAZARDS, LEGACY_FILES, read } from './helpers.js';

const CLI = join(process.cwd(), 'dist', 'cli.js');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'orz-mdhtml-cli-')));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
/** A fresh folder for one scenario. */
const folder = (): string => { const d = join(tmp, `t${++n}`); mkdirSync(d); return d; };

interface Run { code: number; stdout: string; stderr: string }
/** Spawn the CLI (cwd = the given folder, so relative names are relative to it). */
function cli(args: string[], cwd: string = tmp): Promise<Run> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
      if (error && typeof error.code !== 'number') reject(error); else resolve({ code, stdout, stderr });
    });
  });
}
/** The CLI's raw stdout bytes. */
function cliBytes(args: string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
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
      expect(json(r)).toEqual({ ok: true, command: 'assemble', input: join(d, `${name}.md`), output: out, kind: 'md', format: 1, shell: VERSION, delivery: 'inline', uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null, bytes: Buffer.byteLength(assemble(t), 'utf8'), warnings: json(r).warnings });
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
    expect(json(r)).toEqual({ ok: true, command: 'new', file: join(d, 'notes.md'), html: join(d, 'notes.md.html'), kind: 'md', format: 1, uid: h.fields['uid'], title: 'My notes', theme: 'dark-elegant-1', delivery: 'inline', shell: VERSION, warnings: [] });
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
    expect(bytes(join(d, 'notes.md')).equals(before)).toBe(true);
    expect((await cli(['new', 'notes.md', '--force'], d)).code).toBe(0);
    expect(bytes(join(d, 'notes.md')).equals(before)).toBe(false);
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
    expect(json(await cli(['themes', '--json'], d)).themes).toEqual(THEMES.map((t, i) => ({ ...t, default: i === 0 })));
    // failures: 1 (missing file, refused), 2 (usage); --json gives {ok: false} on stdout
    const missing = await cli(['assemble', 'nope.md', '--json'], d);
    expect(missing.code).toBe(1);
    expect(json(missing)).toEqual({ ok: false, command: 'assemble', error: `${join(d, 'nope.md')}: no such file`, exitCode: 1 });
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

  it('[T.7] nothing is overwritten that could lose work: a non-orz output, a .md.html changed after its text, a text twin changed after its file — unless --force; writes leave no temporary file', async () => {
    const d = folder();
    write(join(d, 'a.md'), '# A\n');
    // a non-orz output
    write(join(d, 'a.md.html'), '<!doctype html><p>someone else\'s page</p>');
    const r1 = await cli(['assemble', 'a.md'], d);
    expect(r1.code).toBe(1);
    expect(r1.stderr).toMatch(/not an orz file/);
    expect(text(join(d, 'a.md.html'))).toMatch(/someone else/);
    expect((await cli(['assemble', 'a.md', '--force'], d)).code).toBe(0);
    expect(text(join(d, 'a.md.html'))).toBe(assemble('# A\n'));
    // the .md.html was saved in the browser after the text was written: refused
    write(join(d, 'a.md.html'), assemble('# A, edited in the browser\n'));
    touch(join(d, 'a.md'), 1_700_000_000);
    touch(join(d, 'a.md.html'), 1_700_000_100);
    const r2 = await cli(['assemble', 'a.md', '--json'], d);
    expect(r2.code).toBe(1);
    expect(String(json(r2).error)).toMatch(/changed after .*orz-mdhtml extract/);
    expect(extract(text(join(d, 'a.md.html')))!.text).toBe('# A, edited in the browser\n');
    // the text is newer than the file: assembling is the normal workflow
    touch(join(d, 'a.md'), 1_700_000_200);
    expect((await cli(['assemble', 'a.md'], d)).code).toBe(0);
    expect(extract(text(join(d, 'a.md.html')))!.text).toBe('# A\n');
    // same text: always fine
    touch(join(d, 'a.md.html'), 1_700_000_300);
    expect((await cli(['assemble', 'a.md'], d)).code).toBe(0);
    // extract: the twin was edited after the file was saved: refused; older twin: replaced
    write(join(d, 'a.md.html'), assemble('# A from the browser\n'));
    write(join(d, 'a.md'), '# A edited as text\n');
    touch(join(d, 'a.md.html'), 1_700_000_400);
    touch(join(d, 'a.md'), 1_700_000_500);
    const r3 = await cli(['extract', 'a.md.html'], d);
    expect(r3.code).toBe(1);
    expect(r3.stderr).toMatch(/a\.md exists and holds a different text, changed after/);
    expect(text(join(d, 'a.md'))).toBe('# A edited as text\n');
    touch(join(d, 'a.md'), 1_700_000_300);
    expect((await cli(['extract', 'a.md.html'], d)).code).toBe(0);
    expect(text(join(d, 'a.md'))).toBe('# A from the browser\n');
    write(join(d, 'a.md'), '# again newer\n');
    expect((await cli(['extract', 'a.md.html', '--force'], d)).code).toBe(0);
    expect(text(join(d, 'a.md'))).toBe('# A from the browser\n');
    // the output never replaces the input
    expect((await cli(['assemble', 'a.md', '-o', 'a.md'], d)).code).toBe(2);
    expect((await cli(['extract', 'a.md.html', '-o', 'a.md.html'], d)).code).toBe(2);
    noTemp(d);
  }, 120_000);
});
