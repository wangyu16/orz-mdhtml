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
assembly laws), `spec/FC-19-editor-component.md` (exports), the family plan
`../docs/REBUILD.md` §3a.

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
| A.4 | Content independence: the shell parts are the same for every text (no document data in the shell), and the document parts (head metadata, `<title>`, `lang`, `#orz-meta`, the island) are the same for every delivery and engine. | corpus |
| A.5 | The envelope is the kit's: `#orz-shell` is `{kind: "md", format: 1, shell: VERSION, delivery}`, the generator is `orz-md VERSION`, the agent banner names `#orz-src` and the orz-mdhtml skill, `#orz-includes` holds exactly the includes given (and is absent without them), and the output equals `assembleEnvelope` with this shell's parts. | scenario |
| A.6 | Delivery: inline puts the given engine source in the file once; CDN references `https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@<VERSION>/orz-mdhtml.browser.js` (the kit's `bundleUrl`, as the quiet update derives it) and holds no engine code. | scenario |
| A.7 | `assemble` refuses (throws) a text with NUL or a lone surrogate, a header `format` above 1, an unknown delivery, inline delivery without an engine source, and an engine source that is not script-safe (`<script`, `</script`, CR). | scenario |
| A.8 | The assembler modules (`src/assemble.ts`, `src/inspect.ts`, `src/legacy.ts`, `src/themes.ts`, `src/version.ts`) import no Node built-in: they bundle for `platform: browser` with nothing external. | conformance |
| A.9 | Browser parity: the assembler bundled for the browser and run in real Chrome writes byte-identical files to Node for every `md` corpus file and hazard text. | real |
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
