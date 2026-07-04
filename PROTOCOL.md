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
| `orz-host-save` | file → host | `{ type, protocol: "orz-host-save", version: 1, source, html }` |
| `orz-host-saved` | host → file | `{ type, ok: true }` or `{ type, ok: false, error: string }` |
| `orz-host-dirty` | file → host | `{ type, protocol: "orz-host-save", version: 1, dirty: boolean }` |

`source` is the current embedded markdown source (the single source of truth);
`html` is the full serialized self-reproducing document — **the same bytes a
file save would write**.

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

## Hosted chrome

When the handshake completes (the runtime accepted a valid `orz-host-hello`
and sent `orz-host-ready`), the runtime sets
`document.documentElement.dataset.orzHosted = "1"` and the file's own chrome
CSS hides the orz logo in the upper-left corner — a host platform typically
shows the same orz branding in its own header, and duplicates look broken.
Hosts get this automatically; there is no message field to request or decline
it. The flag is runtime-only — it is stripped on serialization, so saved bytes
never carry it — and unhosted files are unchanged. The `data-orz-hosted`
attribute is the extension point for future hosted-chrome adjustments.

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
