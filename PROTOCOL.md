# `orz-host-save` — the host-embedding save protocol

**Version 1** (`orz-host-save@1`). This document is the canonical spec; it
lives in orz-mdhtml and is implemented identically by the three orz-family
in-file runtimes: **orz-mdhtml** (`.md.html`, kind `md`), **orz-slides**
(`.slides.html`, kind `slides`), and **orz-paged** (`.paged.html`, kind
`paged`).

## Purpose

An orz file is self-contained: opened directly, its Save writes back through
the File System Access API (Chromium) or falls back to downloading a copy.
When a platform embeds the file in an `<iframe>`, the platform — the **host**
— wants to receive saves instead. This protocol lets the host announce itself
with a `postMessage` handshake; after a verified handshake, the file's Save
action posts the document to the host instead of touching the file system.
Without the handshake **nothing changes** — the same file keeps working
standalone, and Export/"Download a copy" keeps working either way.

Actors: the **host** (the embedding page) and the **file** (the self-contained
document's runtime, running in an iframe).

## Messages

| Type | Direction | Payload |
|---|---|---|
| `orz-host-hello` | host → file | `{ type, protocol: "orz-host-save", version: 1 }` |
| `orz-host-ready` | file → host | `{ type, protocol: "orz-host-save", version: 1, kind: "md" \| "slides" \| "paged" }` |
| `orz-host-save` | file → host | `{ type, protocol: "orz-host-save", version: 1, source, html, theme? }` |
| `orz-host-saved` | host → file | `{ type, ok: true }` or `{ type, ok: false, error: string }` |
| `orz-host-dirty` | file → host | `{ type, protocol: "orz-host-save", version: 1, dirty: boolean }` |

`source` is the current embedded markdown source (the single source of truth);
`html` is the full serialized self-reproducing document — **the same bytes a
file save would write**. `theme` (optional, additive since 0.7.0) is the file's
current theme id, so a host can persist the author's theme choice (e.g. a
course-wide default); hosts that ignore it are unaffected.

## Handshake and save sequence

1. The host embeds the file and posts `orz-host-hello` to the iframe's
   `contentWindow` (after the frame loads; re-sending is harmless).
2. The file accepts the hello **only if `event.source === window.parent`**.
   It records `hostOrigin = event.origin` and replies `orz-host-ready` to
   `event.source`, with `targetOrigin = hostOrigin` when that is a real
   origin, else `"*"` (opaque/srcdoc embeddings serialize the origin as
   `"null"`; the ready payload contains nothing the host doesn't already
   have).
3. After a successful handshake, the file's **Save** action posts
   `orz-host-save` to `window.parent` at `hostOrigin` — instead of the File
   System Access / download path. All other save affordances (Export /
   Download a copy) keep working unchanged.
4. The host replies `orz-host-saved`; the file shows its normal saved/error
   state. If no acknowledgement arrives within ~10 seconds, the file shows an
   error and keeps the document (still dirty) — a save is never lost to a
   silent host.
5. Optionally (implemented by all three runtimes), the file posts
   `orz-host-dirty` on edit-state changes after the handshake, so the host can
   reflect unsaved changes.

## Security rules

These files are **executable HTML** (see the README security note), so the
protocol is deliberately narrow:

- The file accepts protocol messages **only from `window.parent`**.
- After the handshake, it accepts them **only from the recorded `hostOrigin`**
  (when that is a real origin, not `"null"`).
- Host-save **never auto-enables** without the host's hello; an unhosted file
  behaves exactly as before.
- The runtime **never evals message content** — payloads are read as data,
  nothing more.
- Hosts should embed the file in a **sandboxed iframe** and validate the
  `html`/`source` they receive like any untrusted document content.

## Versioning

- A breaking change bumps the version (→ `orz-host-save@2`).
- The **host announces** the version it speaks in `orz-host-hello`; the
  **file responds** with the highest version it supports **≤ the host's**, in
  `orz-host-ready`. The host must then speak that version (or abandon the
  handshake).
- Additive fields within a version are allowed; unknown fields must be
  ignored.

---

# `orz-host-ai` — the host-provided AI assistant protocol

**Version 1** (`orz-host-ai@1`). A companion to `orz-host-save`, independent of
it: a host can offer save, AI, both, or neither. When a host advertises AI
operations, the file's editor shows an **assistant** (select text → "Improve
selection" → pick an operation); the file sends the passage to the host, the
host runs the model and returns a suggested replacement the user applies. **The
file owns the UI; the host owns the model, the operation catalog, and any
governance.** No host, no assistant — the file is unchanged.

## Messages

| Type | Direction | Payload |
|---|---|---|
| `orz-host-ai-hello` | host → file | `{ type, protocol: "orz-host-ai", version: 1, operations: [{ id, title, selection }] }` |
| `orz-host-ai-ready` | file → host | `{ type, protocol: "orz-host-ai", version: 1 }` |
| `orz-host-ai-request` | file → host | `{ type, protocol: "orz-host-ai", version: 1, requestId, op, text, selection }` |
| `orz-host-ai-result` | host → file | `{ type, protocol: "orz-host-ai", version: 1, requestId, ok, proposed?, error? }` |

- `operations` — the ops the host offers; the file renders them in its menu.
  `id` is echoed back in a request; `selection: true` means the op runs on a
  selected passage.
- `op` — an advertised `id`. `text` — the content to operate on (the selection,
  or the whole document). `requestId` — correlates concurrent requests.
- `proposed` — the replacement text the file diffs and, on approval, applies.

## Handshake

1. The host posts `orz-host-ai-hello` (with `operations`) to the iframe, retried
   until acknowledged (files behind a slow CDN boot late).
2. The file accepts it **only from `window.parent`**, records the operations +
   host origin, and replies `orz-host-ai-ready`.
3. On an assistant action the file posts `orz-host-ai-request`; the host answers
   `orz-host-ai-result` with the proposal (or `ok: false` + `error`). A request
   with no reply within ~30s fails gracefully; the document is untouched until
   the user applies a result.

## Security & versioning

Same posture as `orz-host-save`: messages accepted only from `window.parent`;
payloads read as data, never evaluated; the assistant never auto-enables without
the host's hello. The applied result is inserted into the editor as ordinary
text — it then saves through `orz-host-save` (or the file's own Export), so it
passes through whatever validation the host's save path enforces. Versioning
follows the same rule (host announces; file replies with the highest it supports
≤ the host's).

---

# `orz-host-include` — host-provided web transclusion

**Version 1** (`orz-host-include@1`). A companion to `orz-host-save` /
`orz-host-ai`, independent of both. Lets the host resolve URL-based markdown
includes (`{{md-include https://…}}` / `{{markdown https://…}}`) for the file's
PREVIEW render, so an editor hosted in a trusted app shows included content
without the standalone file ever fetching author-chosen URLs itself.

## Purpose

The editable source of record keeps the directive (single source of truth). A
hosted file delegates resolution to the host, which owns the fetch and its own
allowlist/policy. **A standalone file (no host) never resolves and never
auto-fetches** — the directive is left as-is (and renders empty via the built-in
filesystem include, which cannot read a URL in the browser). This avoids a
tracking/privacy footgun where opening any file would ping arbitrary hosts.

## Messages

| Message | Direction | Payload |
| --- | --- | --- |
| `orz-host-include-hello` | host → file | `{ type, protocol: "orz-host-include", version: 1 }` |
| `orz-host-include-ready` | file → host | `{ type, protocol, version, kind: "md" \| "slides" \| "paged" }` |
| `orz-host-include-request` | file → host | `{ type, protocol, version, requestId, url }` |
| `orz-host-include-result` | host → file | `{ type, protocol, version, requestId, ok, markdown?, error? }` |

## Handshake and resolution

1. The host posts `orz-host-include-hello` to the iframe, retried until the file
   replies (files behind a slow CDN boot late).
2. The file records the host origin and replies `orz-host-include-ready`, then
   re-renders its preview.
3. For each distinct include URL in the source, the file posts an
   `orz-host-include-request`. The host resolves it (under its own allowlist)
   and replies `orz-host-include-result` with the markdown, or `ok: false`.
4. The file caches the result, inlines it into the PREVIEW render only (the
   source keeps the directive), and re-renders. A request with no reply within
   ~30s resolves as unresolved; the directive is left in place.

## Security & versioning

Same posture as the siblings: messages accepted only from `window.parent` after
the origin is fixed at the handshake; payloads are inlined as markdown source
for rendering, never evaluated; no host means no resolution and no network
request. Versioning follows the same rule (host announces; file replies with the
highest it supports ≤ the host's).
