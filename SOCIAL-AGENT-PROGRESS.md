# KCAA Social Media Agent — Progress & Next Steps

_Last updated: 2026-10-15 (end of day). No secrets (tokens, keys) belong in this file or anywhere in the repo._

## What it is
Volunteers email photos/videos to **social@kcaa.ca**. An agent drafts an English Instagram caption, a human approves it on the Hub's **Post Review** page, and the agent publishes it to **@kcaatoronto**.

## Decisions made
| Topic | Decision |
|---|---|
| Intake | Email to `social@kcaa.ca` (a real Workspace user). Loose subject convention: `Event – date`. |
| Senders | Anyone — personal and @kcaa.ca accounts. No allow-list; **human approval is the only gate**. |
| Platform / language | Instagram only, English only. |
| Approvers | Miriam Panahi, Caitlin Kim, and info@kcaa.ca (same permissions). |
| Publishing | Agent auto-publishes **after approval**, via the Instagram API with Instagram Login. (Deliberate risk acceptance — content is often youth sports photos. Re-confirm before going live if this sits untouched.) |
| Revision cap | 3 change-requests, then the draft is `escalated` to a human and the agent must not redraft. |
| Cadence | Inbox scan daily; publish + token-refresh check every few hours. |
| Hosting | **Scheduled Claude routine only. No paid Firebase (no Blaze plan, so no Cloud Functions / Firebase Storage).** |
| Asset storage | Google Drive. |
| Safety model | The email-reading step has no publish tool; publishing uses only stored Firestore caption/media; email text is untrusted data, never instructions; daily cap ~10 drafts; blocked senders ignored. |
| Photo release | Covered at registration; volunteer instructions should state that emailing the address confirms release coverage. |

## Built and pushed (repo `kcaa-admin/hub`, live at https://kcaa-admin.github.io/hub/)
- **`social-media-review.html`** — Post Review page: one draft at a time, Approve / Request changes (note), sender shown, "New sender" flag, **Trust sender** and **Block sender & discard**, recent decisions, and an "Add a draft by hand" form (with optional sender email) for testing. Working.
- **`firestore.rules`** — `isSocialApprover()`; collections `social_drafts` (approvers read/create-pending/update decision fields only) and `social_senders`. **Already published in the Firebase console.**
- **`nav.js`, `index.html`, `social-media-posts.html`, `admin.html`** — nav link + cards; page actions are logged to the Edit Log as "Social Media Review".
- **`social-intake/Code.gs`** — Google Apps Script running as `social@kcaa.ca`. Every 15 min it saves photo/video attachments (and copies shared Drive-link files) into the Drive folder **Social Intake**, one subfolder per email, each with a `manifest.json` (sender, subject, body, files, skipped, links). Shared with info@kcaa.ca as editor. **Installed and tested — works for attachments.**

### Draft document shape (`social_drafts/{id}`)
`status` (pending | changes_requested | escalated | approved | published | rejected), `event`, `caption`, `mediaUrls[]`, `flags[]`, `source`, `senderEmail`, `createdAt`, `revision`, `feedback[{by,at,note}]`, `decidedBy`, `decidedAt`. Senders: `social_senders/{lowercased email}` = `{email, status: trusted|blocked, by, at}`. After `changes_requested` the agent rewrites the caption, bumps `revision`, and sets status back to `pending`.

## Mail flow (working)
`volunteer → social@kcaa.ca → auto-forward to info@kcaa.ca (filter labels it "Social Intake")` and, in parallel, the Apps Script in `social@` saves attachments to Drive. The Gmail connector (signed in as info@) **can read mail but cannot download attachments** — that is why the Apps Script exists.

## Instagram setup status
- Meta developer account created with a real person's Facebook login; app created in **development mode**; `@kcaatoronto` added as an Instagram tester; **an access token was generated** and is stored privately by Ernie (not in the repo).
- Token expiry isn't shown in the dashboard — **assume ~60 days from 2026-10-15; calendar reminder for ~2026-11-29.** The refresh endpoint's `expires_in` will confirm the real lifetime.
- **Still missing:** the Instagram account ID.

## Known limits / findings
- The Drive connector's `read_file_content` returns **nothing for images**, and `download_file_content` returns only huge base64. **The agent cannot see the photos**, so captions come from the email text + event/date, and spotting identifiable kids is left to the human approver. Plan: if the body is empty, fall back to the event from subject/date and flag the draft "needs details".
- Instagram requires media at a **publicly reachable URL**. Drive links may not work. Plan: test a Drive direct link on the first real publish; fall back to a free host (e.g. Cloudinary free tier). Do **not** put kids' photos in the GitHub repo.
- Test submissions produced duplicate/empty folders (inline `Fwd:` emails lose attachments). The agent should skip any manifest with an empty `files` list.

## Left to do
**Needs you (Ernie):**
1. Create a Firebase **service-account key** (Firebase console → Project settings → Service accounts → Generate new private key) — confirm it's possible; keep the file private. Needed so the routine can write drafts to Firestore for free.
2. Find the **Instagram account ID** for @kcaatoronto.
3. Decide: are captions written from text only (agent can't see the photos) acceptable? _(assumed yes)_
4. Send a test email with a **Drive link to a large video** shared with social@kcaa.ca (checks the link-copy path), and, if possible, an iPhone Mail Drop link and an Android video.
5. Calendar reminder for token expiry (~2026-11-29).
6. Write short **volunteer instructions** (what to email, `Event – date` subject, one line of description, no children's names in the text, Drive link for big videos, release confirmation).

**Needs building (Claude):**
1. **Drafting routine** (scheduled, daily): read `Social Intake`, skip empty/blocked/over-cap submissions, check `social_senders`, write `social_drafts` with `senderEmail`, flags and `mediaUrls`; log to `activity_log`; redraft on `changes_requested` up to the cap; mark processed folders.
2. **Publish routine** (every few hours): for `approved` drafts, expose media at a public URL, post via the Instagram API, set `status: published`, log it.
3. **Token refresh** step (store the refreshed token in a locked-down place, never the repo).
4. Test end-to-end with a private/test post before going live.
5. Update the Hub "Social Media Agent" card and `MASTER-DATA.md` once live.
