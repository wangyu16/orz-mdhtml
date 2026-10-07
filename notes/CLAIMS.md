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
| B.1 | The package depends on orz-markdown `^2.1.0` and builds without shims or aliases: no `build/shims`, no `path-browserify`, no injected `process`; the orz-markdown version comes from `orz-markdown/version`, never from a `package.json` walk. | conformance |
| B.2 | There is one theme list (`src/themes.ts`); its ids are exactly the theme stylesheets orz-markdown ships (`themes/*.css` except `common.css`), and the default theme is one of them. | conformance |
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
| U.1 | Text preserved: for every legacy file (the repo's examples and fixtures, and synthetic ones), the upgraded text is a format-1 header followed by the legacy source exactly (the island unescaped the 0.x way, its wrapper removed); for files whose source text is at hand, that is the original `.md` body byte for byte. | scenario |
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
| R.3 | Edit → type → Save on a `file:` page writes exactly Node `assemble(text)` of the editor's text through the picker — never the live DOM; the second save reuses the handle (no second picker); the written file reopens with the text; a save keeps the file's form (a cdn file stays cdn, `#orz-includes` kept, BOM and CR LF exact). | real |
| R.4 | Theme and measure write the header: outside edit mode through the kit's `editHeader` on the current text (the document is unsaved, the page restyles, Cmd/Ctrl+Z undoes back to the exact saved text, clean), in edit mode as one undoable `setHeader` edit of the editor (the preview takes the new theme); the saved file is `assemble` of that text; leaving edit mode re-renders the read view from the current text. | real |
| R.5 | New document and Save as new copy go through the picker every time and write valid files with the file's delivery: a new uid (`UID_PATTERN`, not the original's), lint clean, shell = VERSION, equal to Node `assemble` of their text, opening and rendering; the copy is the same text with only the uid changed; the opened file is untouched. | real |
| R.6 | In a host frame (cross-origin, `orz-host-save@1`, `-ai@1`, `-include@1`): saves from the read view and from the editor go to the host with `source` = the exact text and `html` = Node `assemble(source)` with the file's includes; the dirty state is posted; the host's AI operations appear in the editor's toolbar and a reviewed proposal applies as one edit; the host's include resolution wins in the read view; no picker, no manifest request, no indicator. | real |
| R.7 | Reader preferences (view mode, split ratio) are stored only under `orz-pref:<uid>:…`, never in the file (the saved file is `assemble(text)` and holds no preference), and come back when the file is reopened. | real |
| R.8 | The quiet update: with a newer release advertised (jsDelivr routed), a top-level `file:` page shows "Update available" next to the brand after one manifest request; Update now writes the new release's assembly of the exact text (its shell version, its bundle inline) into the opened file and reloads the page. | real |

## X — web apps (FD-06, REBUILD §3a "web apps first")

| ID | Claim | Oracle |
|---|---|---|
| X.1 | The example app (`examples/webapp/index.html`) loads the IIFE under a nonce CSP (FC-19 §8.4; the policy is live) and mounts two editors with every FC-19 hook: `save` gets the exact text (`via: 'hook'`), undo stays per instance, `fetchInclude` resolves a preview include, `resolveAsset` rewrites a preview image, a preview link click reaches `resolveLink` as written, `uploadAsset` inserts Markdown, `ai` replaces (API and the app's own selection button), `mintUid` sets the uid; the `chrome: 'none'` editor has no toolbar and the app drives it; `readDocument` and `renderPreview` feed the app's library; no CSP violation, no page error, no update check. | real |
| X.2 | The ESM build (`examples/webapp/esm.html`) mounts the same editor with a save hook, sets no global, and its `assemble` writes the Node bytes. | real |
| X.3 | `docs/embedding.md` tells an app author how to install and import (ESM and IIFE), every export, every hook, the CSP recipe and the version rule (the app pins the component; files carry their own shells). | conformance |

## L — the lift seam (REBUILD §3a owner decision 2)

| ID | Claim | Oracle |
|---|---|---|
| L.1 | The standalone startup's kind-independent modules (`src/browser/standalone/`, `src/browser/ui/`, `src/browser/engine-source.ts`) import only orz-markdown's `carrier` entries and each other — nothing of the md carrier (`md/`, `carrier.ts`, the assembler, presentation, themes) — and name no md-specific class, key or file name; the md carrier reaches them only through `StandaloneKind`. | conformance |
