# ADR-003: The newsletter plugin

| Field      | Value                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- |
| Status     | Proposed. Accepted when the M5 pull request lands (its `astro.config.mjs` change is PATH_ASK). |
| Date       | 2026-11-23                                                                                    |
| Milestone  | M5, Newsletter plugin                                                                         |
| Supersedes | Nothing. Refines ADR-001's newsletter model.                                                  |

## Context

An Admin builds a quarterly newsletter with one section per body, previews it in a real inbox, and sends it to subscribers through a Resend Broadcast (spec FR-6). Visitors subscribe from the site (FR-7). EmDash's system email goes through Resend too (FR-8.1). The constitution adds four rules: the Resend SDK never reaches the browser, TipTap JSON is the editable source and the composed HTML the send artifact, nothing reaches subscribers without a test send and an Admin's approval, and every send carries an unsubscribe link.

Three facts found in M5 shape the design:

1. `resend` 6.39's `broadcasts.create` takes no idempotency key (R3, receipts). A retried request could create a second Broadcast.
2. `composeReactEmail` needs a TipTap `Editor`. The server could build one headlessly, but `@tiptap/core` is not a direct dependency, and adding it changes how pnpm resolves EmDash admin's pinned TipTap peers.
3. A Broadcast's event list goes stale between assembly and approval (R13).

## Decision

```
admin page (browser)                plugin routes (Worker)                     Resend
EmailEditor ── save: JSON + HTML ──▶ issues/save      store, revision + 1
            ── test ───────────────▶ issues/test-send  footer, allowlist only ──▶ emails.send
            ── approve ────────────▶ issues/approve   step(approve), refresh events,
                                                       hold (compare-and-set) ──▶ find by key, else
                                                                                   broadcasts.create
visitor form ── POST ─────────────▶ subscribe        Origin, zod, Turnstile ──▶ contact upsert
EmDash email ───────────────────────▶ email:deliver   cc, replyTo ─────────────▶ emails.send
```

- **Domain in core, I/O at the edges.** The lifecycle (`step`), assembly, the event refresh, the footer and the archive transform are pure functions in `src/lib/core/newsletter`. `src/plugins/newsletter/service.ts` orchestrates them over three ports: the issue store, the mailer and the clock. Routes parse input (zod) and map errors to HTTP. `src/lib/adapters/resend-mailer.ts` is the only module that imports `resend`, and lint lets only the plugin's server modules import it.
- **Compose in the browser, send from the server.** The admin page saves the editor's `getJSON()` and `composeReactEmail({ editor, pretty: false })` together, so each revision's HTML comes from the same editor state as its JSON. The server adds the unsubscribe footer itself (`withFooter`), so a send has the link whatever the document holds. Approve sends the stored HTML of the revision that was test-sent, so subscribers get what was previewed. This departs from FR-6.4's wording, which has the route compose; the alternative was a new TipTap dependency that moves EmDash admin's editor onto another TipTap version.
- **Approval is idempotent.** Approve runs `step(issue, approve)` (FR-6.6 refuses an issue not test-sent at its current revision), then writes the issue as `creating` with a short hold, by compare-and-set on the storage row. Of two concurrent approvals only one write applies. The holder looks the Broadcast up by its name, the key `fm-issue:<id>:rev:<n>` (FR-6.7), before creating one, and records the Broadcast id. A retry finds `creating`: while the hold lasts it is refused; once the holder has finished, failed or crashed it takes the hold and repeats the lookup, so a crash between Resend and the store never sends twice. A definite refusal from Resend returns the issue to a tested draft. An unknown outcome keeps it `creating` and frees the hold.
- **Events are re-read at approval (R13).** If any body's event list changed since assembly, approval updates it, counts that as an edit, and asks for a new test send.
- **Archive in a sandboxed frame (FR-6.8).** The stored email is a whole HTML document, so `/newsletters/[slug]` shows it in an `<iframe srcdoc sandbox="allow-popups allow-popups-to-escape-sandbox">`: no scripts and no same-origin access, and links open in a new tab. Nothing is spliced into the page, so the `set:html` ban holds. The per-recipient unsubscribe footer is swapped for a signup link.
- **Plugin routes are classified.** ADR-002's route table passes every plugin route to EmDash, which checks the route's permission. `PLUGIN_ROUTES` in `route-table.ts` records each newsletter route's guard (`settings:manage`, which only Admins hold, or the public signup route's own checks), and a unit test fails when a declared route is missing or differs.
- **Signup is a plain form post** to a public plugin route answered with a 303 back to the form. EmDash's middleware already refuses a cross-origin post to a plugin route; the route checks again and also refuses a post with no Origin unless it carries `X-EmDash-Request: 1` (FR-7.2). A contact is created or updated in the subscribers Segment with the newsletter Topic and each ticked body's Topic. A global unsubscribe is never reversed from the public form.
- **Fakes only under `astro dev`.** Without keys, or with `RESEND_FAKE`, the dev server uses an in-memory Resend and an offline Turnstile check. `chooseProvider` returns a fake only when `import.meta.env.DEV` is true, and the fake module is imported only inside that branch, so builds do not contain it. `tests/build/check-dist.mjs` fails CI if a build does.

## Consequences

- An Admin must save before a test send or approval; the page disables both while there are unsaved changes.
- The stored HTML is what the Admin's browser composed. An Admin could store HTML that does not match the JSON through the API. Admins are trusted (Q5), the footer is added on the server, and the archive frame runs no script.
- Only one issue is open at a time: "New issue" returns the open draft, and a draft can be discarded to start again.
- The newsletter plugin registers EmDash's `email:deliver` transport only when it can send: `RESEND_API_KEY` and `RESEND_FROM` set, or the dev server's fake. Until then EmDash keeps showing invite links for an Admin to share. On the dev server, system email lands in the fake outbox instead of EmDash's dev console.
- Two behaviors need the staging send test: whether Resend honours `Idempotency-Key` on broadcasts (the key-named lookup does not depend on it), and how the contact endpoints answer for an existing contact (STATUS).

## Alternatives considered

- **Compose on the server with a headless TipTap editor.** Measured to work in Node, but needs `@tiptap/core` as a direct dependency, which re-resolves EmDash admin's TipTap peers. Revisit when EmDash and the editor share a TipTap version.
- **Rely on an idempotency header alone.** Not offered by the SDK for broadcasts and undocumented for the endpoint.
- **`set:html` or a raw `.html` route for the archive.** The first breaks the constitution's rule. The second is safe with a sandbox CSP, but a plugin's raw responses cannot be `text/html`, so it would be a page route; the iframe is one request and one file.
