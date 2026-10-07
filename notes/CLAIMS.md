# orz-mdhtml claims registry

Each claim is one sentence that is true or false about this package, bound to
an oracle that decides which. A test proves a claim by carrying its id in its
title (`[A.1] …`). `tests/claims.test.ts` fails if a claim here has no test,
or a test names a claim that is not here — an unverified claim is red (the
pattern of orz-markdown's `tests/claims.test.ts`).

A known gap is kept as a **probe**: `it.fails('[ID] …')`, a strict expected
failure that turns red the day it starts passing, so the fix has to promote it.

Oracles: **scenario** (behaviour end to end), **conformance** (code obeys a
rule), **corpus** (runs over the shared golden corpus,
`orz-markdown/tests/carrier-corpus`, read from the installed package), **real**
(runs in real Chrome through playwright-core, channel `chrome`). A **real**
test skips when Chrome is not installed; such a run does not verify that claim.

Binding specs: orz-markdown `spec/FC-18-text-format-1.md` (text format 1,
assembly laws), `spec/FC-19-editor-component.md` (exports, editor API),
`spec/shell-runtime.md` (save, preferences, release manifest and bundle rule,
update, chrome), `spec/host-protocols.md`, the family plan `../docs/REBUILD.md`
§3a.

## B — base (rebuild step 1)

| ID | Claim | Oracle |
|---|---|---|
| B.1 | The package depends on orz-markdown `^2.2.0` and builds without shims or aliases: no `build/shims`, no `path-browserify`, no injected `process`; the orz-markdown version comes from `orz-markdown/version`, never from a `package.json` walk. | conformance |
| B.2 | There is one theme list, the kit's (`orz-markdown/themes`: `THEMES`, `DEFAULT_THEME`, `themeInfo`, re-exported by `src/themes.ts`, no copy in `src/`); its ids are exactly the theme stylesheets orz-markdown ships (`themes/*.css` except `common.css`), and the default theme is one of them. | conformance |
| B.3 | `VERSION` (src/version.ts, the shell version every file records) equals the package version. | conformance |

## A — the isomorphic assembler (FC-18 §2, §8)

| ID | Claim | Oracle |
|---|---|---|
| A.1 | Round trip: `extract(assemble(T, o)).text === T` exactly, for every `md` corpus file and every hazard text (CR LF, CR, BOM, astral characters, `</script>` and `<script` in body and header, `<!--`, no final newline, a 100 kB line, the empty text), for inline and CDN delivery, with and without includes. | corpus |
| A.2 | Determinism: `assemble(T, o)` gives the same bytes on every call and after a fresh module load; the assembler modules use no clock, randomness or environment (no `Date`, `Math.random`, `process`, `navigator`, `location`). | corpus |
| A.3 | Idempotence: `assemble(extract(F).text, o) === F` for every file `F` made with options `o`. | corpus |
| A.4 | Content independence: the shell parts depend only on the options and on the header's presentation keys `theme` and `measure` (resolved through the theme list; absent or unknown → the default, never read from the body) — texts with the same presentation get the same shell parts, which hold no other document data — and the document parts (head metadata, `<title>`, `lang`, `#orz-meta`, the island) are the same for every delivery and engine. | corpus |
| A.5 | The envelope is the kit's: `#orz-shell` is `{kind: "md", format: 1, shell: VERSION, delivery}`, the generator is `orz-md VERSION`, the agent banner names `#orz-src` and the orz-mdhtml skill, `#orz-includes` holds exactly the includes given (and is absent without them), and the output equals `assembleEnvelope` with this shell's parts — head: viewport, colour scheme, `#orz-theme`, `#orz-katex`, `#orz-hljs`; body: `#orz-view` > `#orz-doc`, `#orz-chrome`, `#orz-engine`. | scenario |
| A.6 | Delivery: inline puts the given engine source in the file once; CDN references `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<VERSION>/orz-mdhtml.browser.js` (the kit's `bundleUrl`, as the quiet update derives it) and holds no engine code. | scenario |
| A.7 | `assemble` refuses (throws) a text with NUL or a lone surrogate, a header `format` above 1, an unknown delivery, inline delivery without an engine source, and an engine source that is not script-safe (`<script`, `</script`, CR). | scenario |
| A.8 | The assembler modules (`src/assemble.ts`, `src/presentation.ts`, `src/inspect.ts`, `src/legacy.ts`, `src/themes.ts`, `src/version.ts`) import no Node built-in: they bundle for `platform: browser` with nothing external. | conformance |
| A.9 | Browser parity: the real browser bundle (`orz-mdhtml.browser.js`), its `OrzCarrier.assemble` run in real Chrome, writes byte-identical files to Node's `assemble` for every `md` corpus file and hazard text — inline (the engine given, and defaulted to the bundle's own text) and cdn, with and without includes. | real |
| A.10 | `extract` and `readDocument` are the kit's own functions (re-exported, not copies). | conformance |

## N — newDocument (FC-18 §3, §5, §10)

| ID | Claim | Oracle |
|---|---|---|
| N.1 | `newDocument()` returns a text whose header is `{{nyml` / `kind: document` / `carrier: md` / `uid` / the given keys / `}}` in that order, followed by a starter body; `lintHeader` reports nothing; `readDocument` gives kind `md`, the given title, theme, measure and lang, and a uid matching `UID_PATTERN`. | scenario |
| N.2 | Without an injected uid each call mints a fresh one (the kit's `mintUid`); with one, the result is a pure function of the options. | scenario |
| N.3 | `newDocument` refuses an unknown theme or measure, a malformed uid and a value the header cannot hold (line break, `}}`). | scenario |
| N.4 | A new document assembles and extracts back exactly (law 1) and its file's `<title>`, `lang` and `#orz-meta` come from its header. | scenario |

## I — inspect (agent readiness, REBUILD §3a)

| ID | Claim | Oracle |
|---|---|---|
| I.1 | On an assembled format-1 file, `inspect` reports input `assembled`, kind, format, shell version, generator, delivery, the shell's relation to this tool (older / same / newer), uid, title, theme, header keys, the includes count and the header lint; it advises re-assembly for an older shell and the newer tool for a newer one. | scenario |
| I.2 | On a legacy 0.x file, `inspect` reports input `legacy`, its renderer version, delivery, docId, theme, `<title>` and `#orz-meta` keys, no format, not writable, and advises `orz-mdhtml upgrade`. | scenario |
| I.3 | On a text (any Markdown, or a corpus text), `inspect` reports input `text`, the kind (from the file name when given, else the header's `carrier`, else `md`), format, uid, header and lint; a text of a newer format is reported read-only with advice to use a newer tool; another kind is pointed to its carrier; lint errors are named in the advice. | corpus |
| I.4 | On HTML that is not an orz file, `inspect` reports input `html` and does not claim a document. | scenario |
| I.5 | The report is plain JSON data (`JSON.parse(JSON.stringify(r))` equals `r`) and deterministic. | scenario |

## U — upgrade of legacy 0.x files (REBUILD §3a, owner decision 1)

| ID | Claim | Oracle |
|---|---|---|
| U.1 | Text preserved: for every legacy file (the fixtures in `tests/fixtures/legacy/`, among them the 0.8 example `metadata.md.html`, and synthetic ones), the upgraded text is a format-1 header followed by the legacy source exactly (the island unescaped the 0.x way, its wrapper removed); for files whose source text is at hand, that is the original `.md` body byte for byte. | scenario |
| U.2 | Metadata moved: `#orz-meta` (title, author, description, date, keywords, source, licence) becomes header keys; the header names `carrier: md` and a valid uid (the file's own when it matches `UID_PATTERN`, else a fresh one — 0.x UUIDs are not valid uids); a saved theme (`data-theme`) or a non-default 0.x default theme becomes `theme`; `<title>` becomes `title` only when the text has no title of its own. | scenario |
| U.3 | The text's own header always wins: keys it already has are never overwritten; a legacy `kind: meta` block typed into the source is converted to `kind: document` as FC-18 §5 says (the kit's `editHeader`), its lines kept. | scenario |
| U.4 | The upgrade's file is the text's assembly (`upgrade(F).html === assemble(upgrade(F).text, o)`) and extracts back exactly; a format-1 file is re-assembled with its text and includes unchanged; upgrading twice changes nothing more. | scenario |
| U.5 | Nothing unrecognised is dropped silently: an island without the 0.x wrapper, an unknown theme or a value the header cannot hold is kept or left out with a note that `inspect` reports; a non-orz input is refused. | scenario |

## W — the browser engine and its package (rebuild step 3)

| ID | Claim | Oracle |
|---|---|---|
| W.1 | The bundle rule: `orz-mdhtml.browser.js` (and the ESM build) holds no `<script` / `</script` (any case, after backslashes), no CR and no NUL; it is strict UTF-8, the kit's `isScriptSafe` accepts it and `escapeScriptText` leaves it unchanged; the build rewrites `<` as `\x3C` and checks before it computes the integrity. | conformance |
| W.2 | One KaTeX: `katex` and `katex/contrib/mhchem` resolve to one build in the bundle, and `\ce{H2O}` renders through the bundle in Chrome (typeset, no `katex-error`). | real |
| W.3 | `release.json` is a manifest the kit's `parseManifest` accepts — kind `md`, version = the package version, formats `[1]`, an https notes link, `bundle.path` = `orz-mdhtml.browser.js` — whose integrity is the SHA-384 of the bundle's exact bytes (as written to disk); a build for another version writes that version. | conformance |
| W.4 | The IIFE sets `globalThis.OrzCarrier` = `{ kind: "md", version, formats: [1], assemble, extract, readDocument, mountEditor, renderPreview }` (plus `standalone`, null outside a file): `assemble` returns a Promise and rejects what Node refuses, `extract`/`readDocument` agree with the kit, nothing boots or touches storage outside an assembled file, and the bundle alone assembles in a `sandbox="allow-scripts"` frame (the quiet update's sandbox), with the given engine or its own text. | real |
| W.5 | The `orz-mdhtml-browser` package: version in lockstep with `orz-mdhtml`; `exports` `.` → `types` `index.d.ts`, `import` the ESM build, `default` the IIFE; `files` hold the bundle, the ESM build, `release.json`, `index.d.ts` and the README; every runtime export of the ESM build is declared in `index.d.ts`. | conformance |
| W.6 | `renderPreview(text, options)` gives the article's HTML (twin links, or links as written with `twinLinks: false`; file and URL includes from a record, URL includes from the app's `fetchInclude`), or with `document: true` a script-free HTML document with the header's theme, measure and title. | real |

## R — the standalone file (rebuild step 4)

| ID | Claim | Oracle |
|---|---|---|
| R.1 | An inline and a cdn file (the bundle from jsDelivr), opened over `file:` and over http, render every `md` corpus document in the page (`#orz-doc`) with the header's theme stylesheet, measure class and derived title, the file's includes (no fetch), and the orz runtime (QR codes ready, copy-as-Markdown copies Markdown); a light and a dark theme style the page differently; no page errors. | real |
| R.2 | In the browser the file is the 1.0 shell: body = `#orz-src`, `#orz-view`, `#orz-chrome`, `#orz-engine`; the page's only stylesheets are `#orz-theme`, `#orz-katex`, `#orz-hljs`; the chrome (Edit, Theme, Measure, Save, Done, More) lives in the shadow root of `#orz-chrome` and puts no control in the light DOM. | real |
| R.3 | Edit → type → Save on a `file:` page writes exactly Node `assemble(text)` of the editor's text through the picker — never the live DOM; the second save reuses the handle (no second picker); the written file reopens with the text; a save keeps the file's form (a cdn file stays cdn, `#orz-includes` kept, BOM and CR LF exact); a served (http) page is never saved in place — Save returns `{ ok: false, via: 'served-notice' }`, the toast points to Download a copy, and nothing is written. | real |
| R.4 | Theme and measure write the header: outside edit mode through the kit's `editHeader` on the current text (the document is unsaved, the page restyles, Cmd/Ctrl+Z undoes back to the exact saved text, clean), in edit mode as one undoable `setHeader` edit of the editor (the preview takes the new theme); the saved file is `assemble` of that text; leaving edit mode re-renders the read view from the current text. | real |
| R.5 | New document and Save as new copy go through the picker every time and write valid files with the file's delivery: a new uid (`UID_PATTERN`, not the original's), lint clean, shell = VERSION, equal to Node `assemble` of their text, opening and rendering; the copy is the same text with only the uid changed; the opened file is untouched. | real |
| R.6 | In a host frame (cross-origin, `orz-host-save@1`, `-ai@1`, `-include@1`): saves from the read view and from the editor go to the host with `source` = the exact text and `html` = Node `assemble(source)` with the file's includes; the dirty state is posted; the host's AI operations appear in the editor's toolbar and a reviewed proposal applies as one edit; the host's include resolution wins in the read view; no picker, no manifest request, no indicator. | real |
| R.7 | Reader preferences (view mode, split ratio) are stored only under `orz-pref:<uid>:…`, never in the file (the saved file is `assemble(text)` and holds no preference), and come back when the file is reopened; an editor mounted on the file gets the file's one store (`editorContext().preferences`). | real |
| R.8 | The quiet update: with a newer release advertised (jsDelivr routed), a top-level `file:` page shows "Update available" next to the brand after one manifest request; Update now writes the new release's assembly of the exact text (its shell version, its bundle inline) into the opened file and reloads the page. | real |
| R.9 | A top-level file with unsaved changes (typed in the editor, or a header setting outside it) asks before the page goes (`beforeunload`, the browser's own prompt; dismissing keeps the page and the text); a clean or saved file, a setting undone back to the saved text, and the quiet update's reload (after it wrote the current text) do not ask. | real |
| R.10 | An editor mounted on the file through `OrzCarrier.mountEditor` without `hooks.save` is the document being edited: Cmd/Ctrl+S on the page or in it saves that editor (a newer-format one is read-only — it may take the focus, for selection and copy — and writes nothing), never the page's other copy of the text, which comes back when the editor is destroyed; its unsaved changes ask before leaving; once destroyed, the page's shortcuts are its own again. | real |

## P — the Node library (rebuild step 5)

| ID | Claim | Oracle |
|---|---|---|
| P.1 | Inline assembly needs no engine from callers: the library's `assemble` and `upgrade` inline this release's browser bundle — the copy in `dist/` that the build stages from the same bytes as `orz-mdhtml-browser`'s `orz-mdhtml.browser.js`, equal to the in-memory build — so they equal the isomorphic `assemble` with that engine (and the browser's `OrzCarrier.assemble`, A.9); the engine is checked against its `release.json` first, and a missing, stale (another version), altered (integrity) or script-unsafe one is refused with the rebuild command, never inlined. | scenario |
| P.2 | The package is the 1.0 surface: the main export holds exactly the format-1 API (`assemble`, `extract`, `readDocument`, `newDocument`, `inspect`, `upgrade`, `readLegacy`, `THEMES`, `DEFAULT_THEME`, `isThemeId`, `MEASURES`, `DEFAULT_MEASURE`, `VERSION`, `ORZ_MARKDOWN_VERSION`, `FORMATS`, `BUNDLE_FILE`, `cdnBundleUrl`, `engineSource`, `engineFiles`) and none of the 0.9 API; the 0.9 runtime (`assets/app.js`, `src/template.ts`, `src/browser-entry.ts`, the `orzmd.browser.js` build) is gone; `bin` is `dist/cli.js`, `exports` `.` is `dist/lib.js`, `files` hold no `assets`. | conformance |

## T — the CLI (FC-10, REBUILD §3a)

| ID | Claim | Oracle |
|---|---|---|
| T.1 | `orz-mdhtml assemble x.md` and `orz-mdhtml x.md` write `x.md.html` (FC-18 §3 twin name) = the library's `assemble` of the file's exact text — inline by default, `--cdn` for jsDelivr, `-o path`, `-o -` to stdout; the cdn output of the golden text equals the checked-in golden file. | scenario |
| T.2 | `orz-mdhtml new [x.md]` writes a lint-clean text twin (header `kind: document`, `carrier: md`, a fresh uid, then the given `--title`/`--theme`/`--measure`/`--lang`) and with `--html` its assembled file; without a file it prints the text; it refuses an existing file (unless `--force`), an unknown theme or measure (exit 2) and another kind's file name. | scenario |
| T.3 | `orz-mdhtml extract x.md.html` writes the exact text twin: a text made by `new`, saved with CR LF and a BOM, assembled (inline and cdn) and extracted is byte-identical; includes are reported; a 0.x file is refused (exit 1) with the advice to run `upgrade`, and nothing is written. | scenario |
| T.4 | `orz-mdhtml upgrade old.md.html` writes, in place (or `-o`), the library's `upgrade` of a 0.x file and its text twin (`x.md`, `--text`, `--no-text`), keeping the file's delivery unless `--cdn`/`--inline`; a format-1 file of an older shell is re-assembled with its text and includes; an existing, different text twin is refused before anything is written. | scenario |
| T.5 | `orz-mdhtml inspect <file>` prints a human-readable report (golden) and with `--json` exactly the library's `inspect` report, for 0.x files, assembled files, texts, another kind's text and plain HTML. | scenario |
| T.6 | Every command answers `--help`/`-h` (and `help <command>`), `--version` (and `--version --json`), prints one JSON object with `--json` (`{ ok: false, error, exitCode }` on failure) and exits 0 (done), 1 (refused or failed: a missing or non-UTF-8 file, a newer text format, an assembled file given to `assemble`) or 2 (usage); `assemble` has no content options: `--theme`, `--title`, `--measure`, `--lang` are refused with a message that points to the header, and nothing is written. | scenario |
| T.7 | Nothing is overwritten that could lose work unless `--force`: `assemble` keeps an output that is not an orz file and a `.md.html` that holds a different text and changed after its text twin (advice: `extract`); `extract` keeps a text twin that differs and changed after the file; the output never replaces the input; files are written through a temporary file and a rename, none left behind. | scenario |

## H — the conformance harness (rebuild step 6)

| ID | Claim | Oracle |
|---|---|---|
| H.1 | orz-markdown's carrier conformance harness (`registerConformance`, no `allowSkips`) passes against the real carrier: all 45 checks of `CHECK_IDS` ran in real Chrome and passed, `C.update.from-previous` being not applicable (`firstRelease`: 1.0 is the first release of text format 1 and of `release.json`; 0.x files are upgraded, not updated — owner decision 1), and the final `[conformant]` test is green. No local adaptation: the harness gets the plain browser (orz-markdown 2.2.0 counts only bundle requests, H.7, so the shell head's own stylesheets need no workaround). | conformance |
| H.2 | The harness target is the real carrier: `bundle`/`release` are the library's verified `dist/` engine (= the build = `browser/`), `assemble` is the Node library's, `create` is `newDocument`, `editor` is the opened file's own editor (`OrzCarrier.standalone.edit()`), `protocols` both, `next` this build with the patch number bumped (identical but for its version), `firstRelease: true`, no `previous`. | conformance |

## X — web apps (FD-06, REBUILD §3a "web apps first")

| ID | Claim | Oracle |
|---|---|---|
| X.1 | The example app (`examples/webapp/index.html`) loads the IIFE under a nonce CSP (FC-19 §8.4; the policy is live) and mounts two editors with every FC-19 hook: `save` gets the exact text (`via: 'hook'`), undo stays per instance, `fetchInclude` resolves a preview include, `resolveAsset` rewrites a preview image, a preview link click reaches `resolveLink` as written, `uploadAsset` inserts Markdown, `ai` replaces (API and the app's own selection button), `mintUid` sets the uid; the `chrome: 'none'` editor has no toolbar and the app drives it; `readDocument` and `renderPreview` feed the app's library; no CSP violation, no page error, no update check. | real |
| X.2 | The ESM build (`examples/webapp/esm.html`) mounts the same editor with a save hook, sets no global, and its `assemble` writes the Node bytes. | real |
| X.3 | `docs/embedding.md` tells an app author how to install and import (ESM and IIFE), every export, every hook, the CSP recipe and the version rule (the app pins the component; files carry their own shells). | conformance |

## L — the carrier app (REBUILD §3a owner decision 2; orz-markdown 2.2.0 `carrier/app`)

| ID | Claim | Oracle |
|---|---|---|
| L.1 | The standalone startup is the kit's `orz-markdown/carrier/app`, not a copy: the IIFE entry captures its own script (`captureEngineSource()`) and then calls `startCarrier(MD_KIND)`; `src/browser/standalone/`, `src/browser/ui/` and `src/browser/engine-source.ts` are gone; `MD_KIND` supplies the md side of `StandaloneKind` (assemble, newDocument, mountEditor, createReadView, settings, readDocument, extract, renderPreview); the md editor uses the kit's `attachSettings`, `followPresentation` and `renderMarkdownPreviewWithIncludes` (with an empty include record when the page has none — the one `KIT GAP` left, in `src/browser/md/render.ts`). | conformance |
| L.2 | orz-markdown's `renderMarkdownPreviewWithIncludes` resolves the URL includes of a text that also has a file include when it is given no include record (fixed in the kit, `orz-markdown@14cc3bc`); the editor passes it directly as its renderer, with no local workaround. | scenario |

## E — examples (rebuild step 7)

| ID | Claim | Oracle |
|---|---|---|
| E.1 | The committed examples never go stale: every `examples/*.md` has its `examples/*.md.html`, which extracts to exactly that text, was made by this version, and equals a fresh `assemble` of it with its delivery and includes (one inline example, one cdn); the texts have a uid and no header lint errors. `npm run examples` regenerates them. | scenario |
