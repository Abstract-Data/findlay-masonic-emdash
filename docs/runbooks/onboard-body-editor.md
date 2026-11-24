# Runbook: onboard a body editor

**Who runs it:** a Temple administrator (EmDash **Admin** role).
**Result:** a body's secretary (or another editor) can sign in and maintain that body's officers, events and news, and nothing of any other body's.
**Time:** about ten minutes, most of it waiting for the editor to accept.

## Before you start

- The editor's email address. If they will sign in with Google or Microsoft, use the address that account reports.
- The body or bodies they maintain (Findlay Lodge, Chapter, Council, Commandery, Eastern Star or Temple Board).
- Google or Microsoft sign-in only works once a human has configured it (see [Sign-in options](#sign-in-options)). Passkeys always work.

## 1. Invite

1. In the admin, open **Users** and choose **Invite user**.
2. Enter the email address and choose the role **Editor**. Never give a body editor **Admin**: an Admin can write every body's content, manage users and change the site's settings (constitution § Per-body access control).
3. Send the invite. With `RESEND_API_KEY` and `RESEND_FROM` set, the newsletter plugin's Resend transport emails it (FR-8.1; see [newsletter-send.md](newsletter-send.md)). Without them, EmDash shows the invite link instead. Copy the link and send it to the editor yourself, privately: anyone holding it can accept the invitation. On staging, and on any Worker whose `SITE_ENV` is not `production`, email reaches only the addresses in `NEWSLETTER_TEST_ALLOWLIST`: an invite to anyone else fails, so invite an allowlisted address there ([deploy.md](deploy.md)).

To change an editor's bodies later, see [grant-changes.md](grant-changes.md).

## 2. Accept

The editor opens the link and finishes in one of two ways:

- **Passkey (always available).** Their browser asks to create a passkey with the device's fingerprint, face or PIN. Passkeys belong to the site's address, so they must accept on the real site address, not a preview link.
- **Google or Microsoft (when configured).** They choose the provider and sign in with the invited address. EmDash only accepts a verified email that matches the invitation.

Once they land in the admin, they have an Editor account with **no body yet**. Until step 3 they cannot create or change any body content or upload files. Every attempt is refused with "has no body grants".

## 3. Grant

1. Open **Body Access** in the admin navigation (only Admins can use this page).
2. Find the editor's row and tick the body (or bodies) they maintain.
3. Choose **Save** in that row and wait for **Saved**.

The grant applies to the editor's next request. They do not need to sign out. An editor with exactly one body sees it already chosen when they create an entry.

## 4. Check

Ask the editor to open **News** and choose **Add New**. The **Body** field should show their body. If it shows "Choose a body" with no bodies, step 3 was not saved.

## Change or remove access

- **Move an editor to another body:** untick the old body, tick the new one, then **Save**.
- **Remove body access:** untick every body, then **Save**. The editor keeps their account but can no longer write any body's content.
- **Remove the account:** in **Users**, disable the user. Do this when someone leaves office.

## What editors can and cannot do

| An editor with a body grant can                                  | An editor cannot                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Create, edit, publish, schedule and trash their body's officers, events and news | Create, edit, move, publish, schedule, trash or restore another body's content |
| Edit their body's own page (description, schedule note, tag list) | Add a new body, trash, unpublish or schedule a body's page, or use the MCP endpoint |
| Upload images, and edit or delete the files they uploaded        | Change or delete files another person uploaded                      |

Two gaps are accepted on purpose and need the lodge's sign-off before launch (PLAN Q14). Editors can **read** other bodies' unpublished drafts in the admin. Editors can **edit** the site-wide menus, widgets, sections, bylines and static pages. ADR-002 records both.

## Troubleshooting

| What the editor sees                                       | Cause and fix                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| "has no body grants"                                       | Step 3 was skipped or not saved.                                                |
| "has no grant for Findlay Chapter No. 58" (or another body) | They are working on another body's entry, or the wrong body is ticked.          |
| "is not on the officer title list"                         | The title belongs to another kind of body. Pick a title from their body's list. |
| "These tags are not in the … tag list"                     | Add the tag to the body's tag list first (the body's page, **Tag vocabulary**). |
| "cannot trash, unpublish or schedule a body's page"        | Only an Admin takes a body's page offline. Ask a Temple administrator.          |
| "did not upload this file", for a file they uploaded       | The library already held an identical file, so it kept the first uploader's copy. They can still use it; an Admin can change its alt text. |
| "looks like an entry id"                                   | The slug is 26 capital letters and digits. Use words, such as `spring-banquet`. Publishing refuses such a slug too, when it was set in a co-editing session. |
| "The entry's pending draft is missing"                     | On the entry, choose **Discard changes**, then edit again.                      |
| "could not be checked against your body grants"            | A database read failed. Try again; see [incident.md](incident.md) if it keeps happening. |
| "A translation belongs to the body of the entry it translates" | Choose the body the original entry belongs to.                             |
| Google sign-in returns to the login page                   | The Google account's address is not the invited one, or it is not verified.    |
| Microsoft sign-in is missing or fails                      | `MICROSOFT_TENANT_ID` is not set, or their account is a guest in that directory. |

## Sign-in options

Passkeys are on by default. Google and Microsoft appear on the login page once a human stores their credentials as Worker secrets and vars (never in the repository):

- Google: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Microsoft: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT_ID`, which is the directory (tenant) ID. Only sign-ins through that directory count as verified email addresses.

Keep EmDash's **allowed domains** list empty, so no one can sign themselves up. Every editor arrives through an invite.
