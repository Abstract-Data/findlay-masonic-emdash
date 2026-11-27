# Runbook: send the quarterly newsletter

**Who runs it:** a Temple administrator (EmDash **Admin** role). Editors cannot open the builder.
**Result:** one email to every subscriber, with a section per body, and a copy in the public archive at `/newsletters`.
**Time:** about thirty minutes, most of it reading the test email.

Design: [ADR-003](../adr/ADR-003-newsletter-plugin.md). Requirements: spec FR-6, FR-7, FR-8.1.

## Before the first send (once per environment)

A human sets these up in Resend, Cloudflare and the Worker's settings. Nothing is sent until they exist; the builder names any that are missing.

| Setting | What it is | Where |
| --- | --- | --- |
| `RESEND_API_KEY` | A Resend API key with sending access | Worker secret: `pnpm wrangler secret put RESEND_API_KEY --env <staging or production>`, from 1Password |
| `RESEND_FROM` | The sender, on the Resend-verified domain, e.g. `Findlay Masonic Temple <newsletter@findlaymason.org>` | `vars` of the environment in `wrangler.jsonc` |
| `RESEND_SEGMENT_ID` | The `subscribers` Segment every Broadcast goes to | `vars` of the environment in `wrangler.jsonc` |
| `RESEND_NEWSLETTER_TOPIC_ID` | The newsletter Topic every Broadcast is sent under | `vars` of the environment in `wrangler.jsonc` |
| `NEWSLETTER_TEST_ALLOWLIST` | The inboxes test sends go to, comma-separated. Never a subscriber list | `vars` of the environment in `wrangler.jsonc` |
| `TURNSTILE_SECRET` | The secret of the Turnstile widget on the signup and contact forms | Worker secret, as for `RESEND_API_KEY` |
| `TURNSTILE_SITE_KEY` | The public site key of that widget | `vars` of the environment in `wrangler.jsonc` |
| `SITE_ENV` | `production` or `staging`, already set. Anything but `production` limits every email, signup and Broadcast to `NEWSLETTER_TEST_ALLOWLIST` and Resend's `@resend.dev` test inboxes | `vars` of the environment in `wrangler.jsonc` |
| Body Topics | One Resend Topic per body, default "opt out", its id saved in that body's **Resend topic id** field | Resend dashboard, then the body's entry in the admin |

The Worker reads the five `vars` and both secrets at runtime, not at build time. The `vars` are identifiers, not secrets, so they are committed in `wrangler.jsonc` under `env.staging.vars` and `env.production.vars`. Each deploy replaces the Worker's variables with these, so a value typed into the Cloudflare dashboard is lost on the next deploy; change the file instead. An empty value means "not set", and the builder names it.

`TURNSTILE_SITE_KEY` is public, but it too is read at runtime: only the server renders the forms, so the key is never built into the page and one build serves every environment. Without it the forms render with no Turnstile widget, and every signup and contact message is refused as unverified. Check the deployed `/newsletters` page and a body page show the widget. The Worker accepts a token only if Cloudflare says it was solved on the site's own hostname (the address the form posted to, or the configured site address) and in the same form (`subscribe` or `contact`, the widget's `data-action`), so a token solved on another site that uses the same widget, or in the other form, is refused. Cloudflare's test secret keys answer `example.com` and no action, so they fail this check on a deployed site; use them only with the dev server's offline stand-in.

Staging uses its own Segment (a staging-only test Segment) and its own Topics. Because `SITE_ENV` is `staging`, the Worker's Resend client refuses anything that would reach an address other than `NEWSLETTER_TEST_ALLOWLIST` and Resend's `@resend.dev` test inboxes, and logs `email.blocked` with `action` set to what it refused (`src/lib/adapters/send-gate.ts`):

- **Single emails** (test sends, invites, sign-in links, contact messages) with any recipient off the list. Nothing is sent.
- **Signups** from the public form for an address off the list. The address never reaches Resend, and the visitor reads that this is a test copy of the site.
- **Broadcasts** whose Segment holds any contact off the list. At approval the Worker reads every contact in the Segment from Resend before it creates or sends the Broadcast; if one is off the list, or the Segment cannot be read, nothing is created and the admin page says "This is not the production site, so a Broadcast goes only to a Segment of …". The issue stays a tested draft.

So keep the staging Segment to allowlisted and `@resend.dev` addresses, and a body's contact form on staging works only when its **Contact form recipients** are allowlisted. The Segment is checked when the Broadcast is created; a contact someone adds in the Resend dashboard before a scheduled Broadcast goes out is not checked again.

The newsletter plugin is also the site's email provider once `RESEND_API_KEY` and `RESEND_FROM` are set: invites and sign-in links then go through Resend. Check **Settings → Email** shows the newsletter plugin as the provider. Before that, EmDash shows each invite link for you to share.

## 1. Start the issue

1. In the admin, open **Newsletter** and choose **New issue**.
2. The issue gathers every published news item marked "include in newsletter" since the last sent issue's coverage ended (the first issue covers 90 days), one section per body in body order, newest first, then each body's events for the next 60 days. Bodies with nothing to report get no section.
3. If an issue is already open, **New issue** opens it instead. To start over, open it and choose **Discard draft**.

## 2. Edit and save

1. Change the subject and preview text if needed. Write an introduction above the first section, rename headings, reorder or delete article cards. Article text comes from the news item: to change it, edit the news item and start a new issue.
2. Choose **Save**. Each save that changes something is a new version, and the status line shows its number.

## 3. Send a test

1. Choose **Send test**. It goes only to `NEWSLETTER_TEST_ALLOWLIST`, with "[Test]" before the subject.
2. Read it in a real inbox, on a phone too. The unsubscribe link in a test email is the literal `{{{RESEND_UNSUBSCRIBE_URL}}}`; Resend fills it in for subscribers.
3. Any edit after the test needs another test. The page says "Not test-sent since the last edit" until then.

## 4. Approve

1. To send now, leave **Send at** empty. To schedule, pick a future time; it is read in your computer's time zone.
2. Choose **Approve and send**. The issue becomes **Sent** (or **Scheduled**) and the archive link appears.
3. Choosing approve again, or a retried request, cannot send twice: the Broadcast is named by the issue and version, and the plugin looks for it before creating one.

## If approval is refused

| Message | Meaning | What to do |
| --- | --- | --- |
| "Send a test of the current version before approving." | The issue changed after its last test (FR-6.6). | Send a test, then approve. |
| "Upcoming events changed since this issue was assembled…" | An event was added, moved or cancelled. The issue now lists the current events. | Reload the issue, check the event lists, save, send a test, approve. |
| "This issue is being sent right now." | Another approval is talking to Resend, or one crashed in the last two minutes. | Wait a minute and reload. If it still shows **Sending**, approve again: it finds the Broadcast if Resend made one. |
| "Resend could not be reached or did not confirm…" | The outcome is unknown. | Approve again. It looks the Broadcast up first, so it will not send twice. |
| "Resend refused the request: …" | Resend rejected it (often the sender domain). The issue is back to a tested draft. | Fix the cause in Resend, then approve again. |
| "This is not the production site, so a Broadcast goes only to …" | Staging (or a Worker without `SITE_ENV=production`) found a contact off the allowlist in the Segment, or could not read the Segment. Nothing was sent. | Remove the contact from the staging Segment in Resend, or check `RESEND_SEGMENT_ID`, then approve again. |
| "Email sending is not configured. Set …" | A setting from the table above is missing. | Set it, then retry. |

Before editing an issue whose approval failed with "could not be reached", check **Broadcasts** in the Resend dashboard for one named `fm-issue:<issue id>:rev:<version>`. If it exists and sent, do not edit and resend; the issue will show **Sent** on the next approve.

## 5. After the send

- The issue appears at `/newsletters` for every visitor, signed in or not, newest first, and opens in a frame that shows the email as sent, with a signup link in place of the unsubscribe link. The archive shows only each sent issue's subject, date and email.
- A scheduled issue joins the archive once its time passes.
- Subscribers manage their body preferences from the link in each email. Signups from the site's form land in the `subscribers` Segment with the newsletter Topic and the Topics of the bodies they ticked.
- The signup form takes five signups an hour from one network and sixty an hour in total; past that, visitors are asked to try later (`form.rate_limited` in Workers Logs).
- The form never undoes a choice a subscriber made, because anyone can type anyone's address. An address that unsubscribed from all Temple email, or from the newsletter Topic, is not changed: the visitor is told the address unsubscribed before and to use the preferences link in a past newsletter, or to contact the Temple. A subscriber who opted out of a body's Topic stays out of it even if they tick that body again; they add it back from the preferences link. To re-add someone who asks, change the contact in the Resend dashboard.

## Development and tests

`astro dev` without `RESEND_API_KEY` (or with `RESEND_FAKE=true` in `.dev.vars`) sends nothing: an in-memory fake records every email, Broadcast and contact, and Admins can read it at `/_emdash/api/plugins/newsletter/dev/outbox`. A `POST` to `dev/unsubscribe` with `{ "email": … }` marks an address as unsubscribed from all email, as Resend does when a recipient uses the link. Without `TURNSTILE_SECRET` the signup form carries Cloudflare's published test token and an offline check accepts only that. None of this exists in a build: `tests/build/check-dist.mjs` fails CI if the fake reaches the production bundle, and `tests/build/check-runtime-env.mjs` fails it if a build inlines a setting the Worker should read at runtime.
