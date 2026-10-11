# KCAA Hub — GitHub Pages Setup Guide

This folder is a complete, self-contained static site: the Hub, the Roadmap, the Volunteer Program plan, the Brand Guide, the Recruitment intro material, and the Outreach Tracker. All the cross-links between them already point at each other by filename (`index.html`, `roadmap.html`, etc.) instead of claude.ai links, so the whole thing works the moment it's hosted anywhere that serves static files — including GitHub Pages, for free, under your own domain if you want one.

There are two parts to this walkthrough:

1. **Publish the site on GitHub Pages** — straightforward, ~10 minutes.
2. **Wire the Outreach Tracker to Firebase** — so the tracker keeps its live, shared, saves-for-everyone behavior once it's outside claude.ai. This part needs a few more steps because the tracker currently relies on a claude.ai-only feature for storage.

You can do part 1 today and leave the tracker in "local mode" (each visitor's edits stay only in their own browser) until you're ready for part 2 — the site will say so with a small banner at the top of the tracker page until Firebase is configured.

**Sign-in:** the whole Hub is gated by `gate.js`, which requires signing in with an `@kcaa.ca` Google account (see Part 3 — the Google sign-in setup described there isn't just for the attendance tracker anymore, it's what gates every page). There's no shared password anymore.

---

## Part 1 — Publish on GitHub Pages

### 1. Create a GitHub repository

- Go to github.com and sign in (create a free account first if KCAA doesn't have one yet).
- Click **New repository**. Name it something like `kcaa-hub`. Keep it **Public** (GitHub Pages on a free account requires a public repo, unless you're on GitHub's paid plans). Don't add a README — we'll push files directly.

### 2. Add these files to the repository

The simplest way, no command line required:

- Open your new repo on github.com, click **Add file → Upload files**.
- Drag in all six `.html` files from this folder (`index.html`, `roadmap.html`, `volunteer-program.html`, `brand-guide.html`, `recruitment-intro.html`, `outreach-tracker.html`).
- Scroll down, add a commit message like "Initial site", click **Commit changes**.

(If you're comfortable with git/command line instead: `git init`, `git add *.html`, `git commit -m "Initial site"`, `git remote add origin <your repo URL>`, `git push -u origin main`.)

### 3. Turn on GitHub Pages

- In the repo, go to **Settings → Pages**.
- Under **Build and deployment → Source**, choose **Deploy from a branch**.
- Under **Branch**, choose `main` (or whichever branch you pushed to) and folder `/ (root)`. Save.
- GitHub takes a minute or two to build it. Refresh the page and it'll show a link like `https://<your-github-username>.github.io/kcaa-hub/`.

### 4. Visit the site

Open `https://<your-github-username>.github.io/kcaa-hub/index.html` — that's your Hub, live. From there every card links to the right page.

**Optional — a real domain:** if KCAA has (or wants) a domain like `kcaa.ca`, GitHub Pages supports custom domains for free (Settings → Pages → Custom domain). You'd add a DNS record with whoever you register the domain through, pointing it at GitHub's Pages servers — GitHub's own docs walk through the exact DNS values (search "GitHub Pages custom domain" if you go this route). Ask me if you want a hand with this step when you get there.

That's the whole static site handled. Everything except the tracker's live shared data works exactly as it does now, permanently, with zero ongoing cost.

---

## Part 2 — Wire the Outreach Tracker to Firebase

### Why this step exists

The tracker currently saves its data using a feature that only exists inside claude.ai (an artifact database). That's why it's been working as a shared, live-updating tracker so far. Once the page is hosted on GitHub Pages, that feature isn't available anymore — the page needs its own place to store data.

Firebase (a free Google product) is the replacement: it gives the tracker a real shared database, and it's already wired into the `outreach-tracker.html` file in this folder — you just need to create a Firebase project and paste in a few config values. No coding required.

**This is deliberately the simple version.** The tracker is holding a few dozen schools, tops, edited by a small trusted board. Access control isn't handled per-tool — the whole Hub sits behind one Google sign-in gate (`gate.js`, any `@kcaa.ca` account), and `firestore.rules` just checks that same `@kcaa.ca` sign-in before allowing reads/writes here. See Part 3 for the one-time Google sign-in setup in the Firebase console — it's shared across every Live Tool, not just the tracker.

### 1. Create a Firebase project

- Go to [firebase.google.com](https://firebase.google.com), sign in with a Google account (a KCAA-controlled account is a good idea, so board members can share ownership later).
- Click **Go to console → Add project**. Name it `kcaa-hub` or similar. You can decline Google Analytics (not needed here).

### 2. Turn on Firestore (the database)

- In the left sidebar of your new project, click **Build → Firestore Database → Create database**.
- Choose **Start in production mode** (we're pasting in our own simple rules next either way).
- Pick a location close to you (e.g. `nam5 (us-central)` or `northamerica-northeast1` for Canada). This can't be changed later, but it won't matter for a tracker this small.

### 3. Set Firestore security rules

- **Build → Firestore Database → Rules** tab.
- Replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /schools/{schoolId} {
      allow read, write: if true;
    }
  }
}
```

- Click **Publish**.

This is just to get Firestore working while you're setting things up — it leaves the `schools` collection open with no sign-in required. Once you reach Part 3 below, replace this with the full contents of `firestore.rules` instead, which requires an `@kcaa.ca` Google sign-in for `schools` (and every other Live Tool's collection) rather than leaving it open.

### 4. Get your Firebase config values

- **Project settings** (gear icon, top left) → scroll to **Your apps** → click the **</>** (web) icon to register a new web app.
- Give it a nickname like "KCAA Hub site" (no need to check "Firebase Hosting" — you're using GitHub Pages instead).
- Firebase shows you a `firebaseConfig` object that looks like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "kcaa-hub-xxxxx.firebaseapp.com",
  projectId: "kcaa-hub-xxxxx",
  storageBucket: "kcaa-hub-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

Copy this whole block (or just note the six values).

### 5. Paste the config into `outreach-tracker.html`

- Open `outreach-tracker.html` (in GitHub's web editor — click the file, then the pencil/edit icon — or on your own computer).
- Find this block near the top of the `<script>` section (it's clearly marked):

```js
var firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};
```

- Replace each placeholder with the matching value from step 4.
- Commit the change (GitHub's web editor has a "Commit changes" button right there).

GitHub Pages will redeploy automatically within a minute or two. Reload the live tracker page — the "Live sync isn't available" banner should be gone, and the page is now backed by your Firebase database.

> These config values are not secret — they're meant to be visible in a website's code (that's normal for Firebase). What actually protects your data is the security rule from step 3, not hiding these values.

### 6. Re-add the 5 schools already in the tracker

Because this is a brand-new database, it starts empty. The five schools you already added (Thornhill SS, Thornlea SS, Stephen Lewis SS, Westmount CI, Hodan Nalayeh SS) will need to be re-entered once through the "Add a new entry" form at the bottom of the live page — after that, they're saved for good, the same as before. This is a one-time step; I'm happy to prep a copy-paste-ready list of their details if that speeds it up when you're at that point.

---

## Quick reference — file map

| Page | File |
|---|---|
| Hub (home) | `index.html` |
| Roadmap | `roadmap.html` |
| Volunteer Program | `volunteer-program.html` |
| Brand Guide | `brand-guide.html` |
| Recruitment intro material | `recruitment-intro.html` |
| Outreach Tracker | `outreach-tracker.html` |
| Attendance Tracker (board) | `attendance-tracker.html` |
| Parent check-in (public, from the QR code) | `checkin.html` |
| Check-in QR poster | `checkin-qr.html` |
| Firestore rules (paste into Firebase) | `firestore.rules` |

All internal links between these pages already use these filenames, so as long as they all sit in the same folder (repo root, as this guide sets up), nothing else needs to change.

## What never changes here

Nothing about the Brand Guide, Roadmap, Volunteer Program, or Recruitment intro material needs Firebase or any other backend — they're plain pages and will work forever on GitHub Pages at no cost. Only the Outreach Tracker needs Part 2, because it's the one page with data that's meant to be shared and saved.

---

## Part 3 — Hub-wide Google sign-in (and the attendance tracker's kids' data)

The whole Hub requires signing in with an `@kcaa.ca` Google account — `gate.js` handles this on every page, and `firestore.rules`' `isAdmin()` checks the same `@kcaa.ca` domain before allowing any Firestore read/write. There's no shared password and no per-person email list to maintain — anyone with a working `@kcaa.ca` account is in.

The one exception is the attendance tracker's parent-facing side, which holds kids' data and is intentionally **not** behind this gate at all:

- **Parents** (`checkin.html`, no sign-in) can only look up one child by typing their exact full name, and add a check-in or a walk-in. They can't list the roster or see anyone else's data.
- **The board** (`attendance-tracker.html`, and everything else in the Hub) requires the `@kcaa.ca` sign-in described above.
- **The roster itself is never in this repo.** It only lives in Firebase, loaded by pasting from the 2026-2027 Future Stars sheet on the tracker page.

### One-time setup (about 5 minutes, in the Firebase console for `kcaa-hub`)

1. **Turn on Google sign-in:** Build → Authentication → Get started → Sign-in method → Google → Enable → pick a support email → Save.
2. **Allow the site's domain:** Authentication → Settings → Authorized domains → Add domain → `kcaa-admin.github.io`.
3. **Publish the rules:** Firestore Database → Rules → replace *everything* with the contents of `firestore.rules` → Publish. (This is the step that actually requires `@kcaa.ca` sign-in for `schools`, `meeting_minutes`, and `coffee_pickup`, instead of leaving them open.)
4. **Load the roster:** open the Attendance Tracker → sign in with an `@kcaa.ca` Google account → Roster sync. In the sheet, open the Learn 2 Skate tab, Ctrl+A, Ctrl+C, paste, Sync. Repeat for the Future Stars tab.
5. **Test:** on the tracker, click "Open test check-in", type a rostered child's name, and watch it appear under "Test session".
6. **Print** the poster from `checkin-qr.html`.

### Giving someone access, or taking it away

Access is domain-based, not a per-person list: anyone signing in with an `@kcaa.ca` Google account gets in automatically — nothing to edit in `firestore.rules` when someone joins. To revoke access for one person without affecting anyone else, that has to happen at the `@kcaa.ca` Google Workspace level (suspend/remove their account), since Firestore itself only checks the domain. If the board ever wants a tighter, explicit allow-list again instead of the whole domain, `isAdmin()` in `firestore.rules` can go back to an email list — ask me and I'll make that change.

### Every week

Nothing. The QR code always points to `checkin.html`, which works out the session from the date (Toronto time). On non-session days it shows the next session date instead of a form. When new kids register, paste that tab into Roster sync again.

### Next season

Update the `SESSIONS` list in `checkin.html` and `attendance-tracker.html`, and `validSession()` in `firestore.rules`. If the site ever moves to a custom domain (e.g. kcaa.ca), the printed QR code still points at the github.io address, so reprint it from `checkin-qr.html` after updating `CHECKIN_URL`.
