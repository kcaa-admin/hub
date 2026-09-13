# KCAA Master Data

One place to look up and add the codes, programs, and people used across the Hub — so the same code always means the same thing everywhere it shows up (meeting minutes, the outreach tracker, future tools).

This is a reference file, not live app data. Nothing in the Hub reads this file automatically yet — when you add a new code here that needs to actually show up correctly in a page (e.g. a new committee code appearing as a tag in Meeting Minutes), say so and it can get wired into that page's code too.

---

## Program / committee codes

Used in Meeting Minutes for action-item categories.

| Code | Full name |
|---|---|
| GO | Governance |
| HK | Hockey |
| BS | Baseball |
| BK | Basketball |
| GF | Golf |
| SO | Soccer |
| CO | Communications |
| SM | Social Media |
| FI | Finance |
| PT | Partnerships |
| NB | New Business |

Not yet assigned a code (shows up as a role below, but no action items have used it yet) — add one here when it's needed:

| Code | Full name |
|---|---|
| ? | Website |

**To add a new code:** add a row above with a short 2–3 letter code and its full name. That's it for the reference — if you want it to display as a full name (not the raw code) as an action-item tag in Meeting Minutes, mention it and it'll get added to that page's code too.

---

## Current board / members

Name, and which committee(s)/program(s) they're associated with. Kept in sync loosely with meeting attendance — update here first when someone joins, leaves, or changes committees, then it can be reflected in the Meeting Minutes attendee list.

| Name | Committees |
|---|---|
| Danny K | Hockey, Partnerships |
| Randy K | Basketball, Website |
| Danny H | Finance, Basketball |
| Josh K | Baseball, Hockey, Social Media |
| Michelle C | Golf, Communications |
| Henna C | Social Media, Baseball |
| Caitlin K | Hockey, Golf, Soccer |
| Joel C | Baseball, Golf, Social Media |
| Aparna Y | Soccer, Governance, Golf |
| Ernie J | Governance, Finance, Hockey, Website |
| Miriam P | Communications, Hockey, Partnerships |

> Note: the raw meeting data has a recurring typo, "Baseketball," for Danny H's role — corrected to Basketball here. Worth fixing at the source in `meeting-minutes.html` at some point, not urgent.

**To add a new member:** add a row above with their name and committee(s).
**To retire a member:** just delete their row (or move it to a "Past members" section below if you want to keep history).

---

## Other fixed vocabularies

Smaller sets of codes already baked into the app, listed here so they're not forgotten if someone goes looking:

- **Meeting status:** `draft`, `final`
- **Action item status:** `pending`, `in-progress`, `complete`

These are unlikely to need new values often, but if they ever do, the same pattern applies — add it here, then it can get wired into the relevant page.
