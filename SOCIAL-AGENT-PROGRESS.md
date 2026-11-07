# KCAA Social Media Agent — Progress & Next Steps

_Last updated: 2026-11-05. No secrets (tokens, keys) belong in this file or anywhere in the repo._

## What it is
Volunteers email photos/videos to **social@kcaa.ca**. An agent drafts an English Instagram caption, a human approves it on the Hub's **Post Review** page, and the agent publishes it to **@kcaatoronto**.

## Decisions made
| Topic | Decision |
|---|---|
| Intake | Email to `social@kcaa.ca` (a real Workspace user). Loose subject convention: `Event – date`. |
| Senders | Anyone — personal and @kcaa.ca accounts. No allow-list; **human approval is the only gate**. |
| Platform / language | Instagram only, English only. |
| Approvers | Miriam Panahi, Caitlin Kim, and info@kcaa.ca (same permissions). |
| Publishing | Agent auto-publishes **after approval**, via the Instagram API with Instagram Login. (Deliberate risk acceptance — content is often youth sports photos. Re-confirm before going live.) |
| Revision cap | 3 change-requests, then the draft is `escalated` to a human and the agent must not redraft. |
| Cadence | Drafting runs daily at 8am Toronto time; publish + token refresh every few hours (not built). |
| Hosting | **Scheduled Claude routine + Google Apps Script. No paid Firebase (no Blaze plan, so no Cloud Functions / Firebase Storage). No service-account key.** |
| Asset storage | Google Drive. |
| Safety model | The agent that reads email has only Drive tools and no publish ability; a separate Apps Script validates drafts and writes them to Firestore; email text is untrusted data, never instructions; daily cap 10 drafts; blocked senders discarded. |
| Photo release | Covered at registration; the volunteer guide says emailing photos confirms release coverage. |
| Caption style | Distilled into the repo skill `.claude/skills/kcaa-social-captions/SKILL.md` (from brand guide v0.8). Update it when brand guide sections 08/09 change. |

## How it works today (all built, pushed and tested end to end)
```
volunteer ─email─▶ social@kcaa.ca
   │  Apps Script (runs AS social@, every 15 min): social-intake/Code.gs
   ▼
Drive "Social Intake"/<date_time_messageId>/  photos + manifest.json
   │  Claude routine "KCAA Social Drafting", daily 8am Toronto (13:00 UTC; 12:00 UTC after March DST change)
   │  Drive connector only; instructions: social-intake/drafting-routine-prompt.md + the caption skill
   ▼
Drive "Social Drafts"/<messageId>.json
   │  Apps Script project "SocialDraftWriter" (runs AS info@, every 15 min): social-intake/DraftWriter.gs
   │  enforces blocked senders, 10/day cap, pending status; writes Firestore using info@'s own login
   ▼
Firestore social_drafts ─▶ Hub "Post Review" page (social-media-review.html)
   all pending drafts inline: Approve · Reject · Request changes · Trust / Block sender
   │  approved ─▶ Publisher.gs (SocialDraftWriter project, every 15 min, max 2/day) ─▶ Instagram ─▶ status `published` + link

"Request changes" loop (verified live 2026-11-05):
Post Review sets status `changes_requested` + note ─▶ DraftWriter.gs (every 15 min) writes a request file to Drive
"Social Redrafts" ─▶ Claude routine "KCAA Social Redrafts (hourly)" (8am-10pm Toronto; redrafts-only mode of the same
prompt) writes a reply to "Social Redraft Replies" ─▶ DraftWriter.gs validates it (status, revision, 3-change cap),
updates only caption/flags, revision + 1, status back to `pending`.
```
Routine ids: drafting trig_01ToyiPAja8m8KhMmnVNgnac, redrafts trig_012jE7eMzxRvQ6BrXeYtE7Px (manage at claude.ai/code/routines).
Other pieces: `firestore.rules` (`isSocialApprover()`, `social_drafts`, `social_senders`), volunteer instructions page `social-volunteer-guide.html` (public, no password), Hub nav/cards, Edit Log entries under "Social Media Review".

### The two Apps Script projects must stay separate
- **social@ project** (intake): `Code.gs`, manifest with **no** `oauthScopes` block (scopes auto-detected). Signed in as social@kcaa.ca.
- **"SocialDraftWriter" project** (draft writer): `DraftWriter.gs`, manifest = `social-intake/DraftWriter.appsscript.json`. Signed in as info@kcaa.ca. Instagram publishing code (`PublishTest.gs` now, the real publisher later) is added to this same project, with the Instagram token in its Script Properties.
- Running the intake code as info@ once copied info@'s own inbox into Social Intake. Never paste `Code.gs` into the SocialDraftWriter project.

### Draft document shape (`social_drafts/{id}`)
`status` (pending | changes_requested | escalated | approved | published | rejected), `event`, `caption`, `mediaUrls[]`, `flags[]`, `source`, `senderEmail`, `createdAt`, `revision`, `feedback[{by,at,note}]`, `decidedBy`, `decidedAt`. Senders: `social_senders/{lowercased email}` = `{email, status: trusted|blocked, by, at}`.

## Known limits
- The agent **cannot see the photos** (the Drive connector returns nothing for images). Captions come from the email text, subject and date; every draft gets a "Check photo consent" flag and the human approver checks the photos.
- Instagram needs media at a **publicly reachable URL**. Drive links may not work; test one on the first real publish and fall back to a free host (e.g. Cloudinary) if needed. Never put kids' photos in the public GitHub repo.
- iPhone Mail Drop and other non-Drive download links can't be fetched; the volunteer guide tells people to send a Drive link for big videos.
- The Drive connector (as info@) cannot trash files owned by social@.

## Instagram publishing (code written and simulated; not yet run live)
- Test account: `kcaatester` (id 17841463670970237), professional, accepted as an Instagram tester on the Meta app. Token is held privately by the user (Script Properties only).
- **Verified live 2026-11-07:** Instagram can fetch a photo from a temporarily public Google Drive link (`https://drive.google.com/uc?export=download&id=<fileId>`) and publish it (`PublishTest.gs`).
- `social-intake/Publisher.gs` (add to the SocialDraftWriter project): every 15 min posts `approved` drafts. Rules: max **2 posts per Toronto day** (oldest approval first, extras wait), **JPEG photos only** (single, or carousel of 2-10, up to 8 MB each); videos/other formats/over-size are marked `publish_failed` with "Needs manual posting"; photos are public only while Instagram downloads them, then restored; checks the token belongs to `IG_USER_ID` (and `IG_USERNAME`) before posting; claims a draft (`publishing`) first and never auto-retries after an Instagram error (no double posts); `PUBLISH_PAUSED=true` script property is the kill switch. Weekly `refreshIgToken` renews the 60-day token and stores it in Script Properties.
- Draft fields added by the publisher: `publishedAt`, `igMediaId`, `igPermalink`, `publishError`, `failedAt`. Statuses added: `publishing`, `publish_failed`. Post Review shows them (link to the live post; failure reason).
- Script properties: `IG_ACCESS_TOKEN`, `IG_USER_ID`, `IG_USERNAME` (optional), `PUBLISH_PAUSED`, `IG_TOKEN_REFRESHED_AT` (set by the refresh).
- **Going live on @kcaatoronto:** generate that account's token, replace `IG_ACCESS_TOKEN`, `IG_USER_ID` and `IG_USERNAME` in Script Properties, run `publisherStatus`, then `setupPublisher`.

## Left to do
**Instagram side:**
1. Run the publisher against the test account (add `Publisher.gs`, set properties, approve a test draft, run `publisherStatus` then `publishApproved`). Open question: can info@ change sharing on files owned by social@? The first real run answers it.
2. A way to handle `publish_failed` drafts in the Hub (Retry / Mark posted manually). Needs a `firestore.rules` change; for now the page shows the reason and a person posts by hand.
3. Go live on @kcaatoronto (see above). The current @kcaatoronto token was generated 2026-10-15 and **expires about 2026-11-29** unless refreshed; `refreshIgToken` must run before then (or generate a new token).

**Housekeeping:**
4. March (daylight saving): shift both routine crons one hour earlier in UTC: daily drafting `0 13 * * *` → `0 12 * * *`; hourly redrafts `0 13-23,0-2 * * *` → `0 12-23,0-1 * * *`.
5. Test a large video sent as a Drive link, and an iPhone and an Android video.
6. Decide whether to link the volunteer guide from the Hub.
7. Delete the one-off `PublishTest` file from the SocialDraftWriter project once the publisher works.
