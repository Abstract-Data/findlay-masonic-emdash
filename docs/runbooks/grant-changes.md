# Runbook: change who can edit which body

**Who runs it:** a Temple administrator (EmDash **Admin** role).
**Result:** an editor can write exactly the bodies they serve, starting with their next request.
**Time:** two minutes per change.

New editors start with [onboard-body-editor.md](onboard-body-editor.md). This runbook is for the changes after that: elections, an editor serving a second body, someone leaving office. Design: [ADR-002](../adr/ADR-002-body-access-middleware.md).

## How grants work

- A grant is one user and one body. An editor may hold several. The **Body Access** page (Admins only) shows a row per user and a tick per body.
- **Save** in a row replaces that user's grants with what is ticked. It applies to the user's next request; they do not need to sign out.
- Admins need no grants: they write every body. Never make a body editor an Admin to give them more bodies; tick the bodies instead.
- An editor with no grants keeps their account and can read the admin, but cannot create, change, publish or trash any body's officers, events or news, and cannot upload files.

## Common changes

| Change | Steps |
| --- | --- |
| An editor also serves another body | Tick the second body in their row, **Save**. |
| An editor moves to another body | Untick the old body, tick the new one, **Save**. |
| An editor steps down but keeps an account | Untick every body, **Save**. |
| Someone leaves the Temple | Untick every body, **Save**, then in **Users** disable the account. |
| A new year's officers take over | Grant the incoming secretary first, check they can edit (below), then remove the outgoing one. |

## Check the change

Ask the editor to open **News** → **Add New**. The **Body** field lists exactly the bodies they hold, with a single body chosen already. To check without them: their next refused write appears in Workers Logs as `body_access.refused` with their user id and the body it names ([workers-logs.md](../observability/workers-logs.md) § Finding things).

## When an editor is refused

| The message says | Cause and fix |
| --- | --- |
| "has no body grants" | Nothing is ticked for them, or the row was not saved. |
| "has no grant for Findlay Chapter No. 58" (or another body) | The entry belongs to a body they do not hold, or a draft moved it there. Tick the body if they should have it. |
| "The change could not be checked against your body grants, because a lookup failed" | A database read failed; nothing is wrong with their grants. Try again; if it keeps happening, see [incident.md](incident.md). |
| "The entry's pending draft is missing" | The entry points at a draft that no longer exists. On the entry, choose **Discard changes**, then edit again. An Admin sees the same message and does the same. |
| "No entry matches this request" | The entry was deleted or renamed while they had it open. Reload. |
| "looks like an entry id" | The slug is 26 capital letters and digits, which could make a change reach another entry. Use words, such as `spring-banquet`. This also refuses publishing or scheduling a draft whose slug was set that way in a co-editing session. |
| "cannot trash, unpublish or schedule a body's page" | Only an Admin takes a body's page offline. |

## Audit

Grants are stored in the body-access plugin's storage, not in content, so they have no revision history. To record a change, note it in the Temple's minutes. The **Body Access** page always shows the current state.
