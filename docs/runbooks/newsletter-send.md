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
| `TURNSTILE_SECRET` | The secret of the signup form's Turnstile widget | Worker secret, as for `RESEND_API_KEY` |
| `TURNSTILE_SITE_KEY` | The signup form's Turnstile widget | The shell that runs the deploy (see below). Not a Worker variable |
| Body Topics | One Resend Topic per body, default "opt out", its id saved in that body's **Resend topic id** field | Resend dashboard, then the body's entry in the admin |

The Worker reads the four `vars` and both secrets at runtime, not at build time. The `vars` are identifiers, not secrets, so they are committed in `wrangler.jsonc` under `env.staging.vars` and `env.production.vars`. Each deploy replaces the Worker's variables with these, so a value typed into the Cloudflare dashboard is lost on the next deploy; change the file instead. An empty value means "not set", and the builder names it.

`TURNSTILE_SITE_KEY` is different: the build writes it into the page, so the Worker's settings cannot change it, and each environment's build must be given its own key. Deploy with the key in the environment, for example `TURNSTILE_SITE_KEY=<staging site key> pnpm run deploy:staging`. A build without it serves a form with no Turnstile widget, and every signup is refused as unverified. Check the deployed `/newsletters` page shows the widget.

Staging uses its own Segment (a staging-only test Segment holding only allowlisted addresses) and its own Topics, so a staging approval never reaches a real subscriber.

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
| "Email sending is not configured. Set …" | A setting from the table above is missing. | Set it, then retry. |

Before editing an issue whose approval failed with "could not be reached", check **Broadcasts** in the Resend dashboard for one named `fm-issue:<issue id>:rev:<version>`. If it exists and sent, do not edit and resend; the issue will show **Sent** on the next approve.

## 5. After the send

- The issue appears at `/newsletters` for every visitor, signed in or not, newest first, and opens in a frame that shows the email as sent, with a signup link in place of the unsubscribe link. The archive shows only each sent issue's subject, date and email.
- A scheduled issue joins the archive once its time passes.
- Subscribers manage their body preferences from the link in each email. Signups from the site's form land in the `subscribers` Segment with the newsletter Topic and the Topics of the bodies they ticked.
- An address that unsubscribed from all Temple email is never added back by the form. The visitor is told the address unsubscribed before and to use the preferences link in a past newsletter, or to contact the Temple. To re-add someone who asks, change the contact in the Resend dashboard.

## Development and tests

`astro dev` without `RESEND_API_KEY` (or with `RESEND_FAKE=true` in `.dev.vars`) sends nothing: an in-memory fake records every email, Broadcast and contact, and Admins can read it at `/_emdash/api/plugins/newsletter/dev/outbox`. A `POST` to `dev/unsubscribe` with `{ "email": … }` marks an address as unsubscribed from all email, as Resend does when a recipient uses the link. Without `TURNSTILE_SECRET` the signup form carries Cloudflare's published test token and an offline check accepts only that. None of this exists in a build: `tests/build/check-dist.mjs` fails CI if the fake reaches the production bundle, and `tests/build/check-runtime-env.mjs` fails it if a build inlines a setting the Worker should read at runtime.
