# Plan — GroupTripIt in the App Store and Google Play

Status: **draft, not started** (owner, 2026-09-28: "draft a plan that we can use
in the future"). Nothing here is built. Today people install GroupTripIt from the
browser ("Add to Home Screen"), and notifications already work that way,
including on the iPhone lock screen (tested 2026-09-28).

## The short version
Wrap the existing web app in a thin native shell with **Capacitor** (free,
open source) instead of rebuilding it. One codebase keeps serving the website,
the home-screen app, and the iPhone and Android apps. The native apps add what
browsers can't do well: real push notifications, the phone's share sheet,
camera/photo picker, and invite links that open straight in the app.

## Why this approach
| Option | Verdict |
|---|---|
| **Capacitor shell around `app/` (recommended)** | Reuses every screen as-is. Native projects live in a separate `native/` folder, so `app/` stays no-build. Same approach for iPhone and Android. |
| Google "Trusted Web Activity" (Android only) | The quickest way into Google Play, since it keeps web push and instant updates. But it does nothing for iPhone, so we'd end up with two different setups. Worth it only if we want Android first. |
| Rewrite in React Native / Swift + Kotlin | Months of rework, and it duplicates the web app. Not worth it for this app. |

**Apple's main hurdle:** it rejects apps that are "just a website in a box"
(App Review Guideline 4.2, minimum functionality). The shell has to add real
native value: native push, share sheet, photo picker, haptics, and deep links.
Without those, it would likely be rejected.

## Costs (need owner approval, per the free-tier rule)
- Apple Developer Program: **$99 / year**.
- Google Play developer account: **$25 once**.
- Custom domain (recommended, see phase 4): about **$12 / year**.
- Everything else stays free: Capacitor, Firebase Cloud Messaging (push),
  TestFlight, Play testing tracks, Supabase free tier.

## Owner-only steps (the rest is Claude's work)
1. Enroll in the Apple Developer Program and create a Google Play developer
   account. Both verify identity. **Decide individual vs company first:** an
   individual account shows your legal name as the seller on the store page. A
   company account shows the company name but needs a D-U-N-S number (free,
   can take 1–2 weeks).
2. Accept the store agreements. A free app doesn't need banking or tax forms.
3. Create a Firebase project (for push) and paste two keys as Supabase Edge
   Function secrets. Claude will give step-by-step clicks.
4. Buy the domain if we go that way.
5. Recruit **12 testers** for Google Play. New personal accounts must run a
   closed test with 12+ people for 14 days before the app can go public.
   Company accounts are exempt.

## Phases

### Phase 0 — Decisions (owner)
- Approve the costs above.
- Individual vs company account (see above).
- App name: GroupTripIt (owner, 2026-09-28). Check it is free on both stores
  before paying. The bundle ID will be something like `com.<you>.grouptripit`,
  and it can't be changed later.
- iPhone only, or iPad too? iPhone-only is simpler (fewer screenshots, less
  review surface). The iPad would still run the iPhone version.

### Phase 1 — Store readiness in the web app (helps the website too)
Both stores require these, and none of them exist yet:
- **Privacy policy page and support page**, public URLs. The owner skipped the
  privacy note earlier; it becomes mandatory here.
- **"Delete my username and data"** in settings. Apple requires in-app
  account deletion for any app where people create accounts, and a username
  counts. Leave trip / delete trip already exist; this removes everything tied
  to the username.
- **Report and remove shared photos.** Apple requires a way to report
  objectionable content and to block people for apps with user-generated
  content. It's light-touch for private groups: a "Report" item on a photo, the
  organizer can remove photos (already true), and a way to contact us.
- **Recommended: the short PIN on usernames** (already on the "possible next
  steps" list). Store reviewers try apps as strangers. "Type any username to
  become that person" is a likely review question and the main open risk
  anyway.
- Store-review demo account: reviewers get a demo username
  (e.g. `demo-guest`) plus instructions.

### Phase 2 — Native shell (Capacitor)
- New `native/` folder with the Capacitor config and the Xcode and Android
  Studio projects. `app/` stays plain HTML/JS, no npm.
- Bundle the `app/` files inside the app, so it opens instantly and works
  offline. A small script copies `app/` into the native projects before each
  build.
- Native touches (these are what pass Guideline 4.2):
  - push notifications (phase 3)
  - share sheet for invite links (`navigator.share` already works, and native
    is smoother)
  - camera/photo picker for the album and receipts
  - haptics on key taps
  - status bar and safe areas
  - splash screen and app icon
- Outside links (Venmo, booking sites, Google Maps) open in the phone's
  browser or app, keeping the "outside connections are safe on their own"
  rule. The embedded iframes (Windy, Google map) work the same inside the app.
- `pwa.js` gets a "running as a native app" mode: hide "Add to home screen",
  use native push instead of web push, skip the service worker (native
  WebViews don't run it; the bundled files and saved trip copy cover offline).

### Phase 3 — Native push notifications
- Use **Firebase Cloud Messaging** for both platforms. It relays to Apple's
  push service, so the server has one way to send.
- Database: store native device tokens next to today's web-push subscriptions
  (a `kind` column or a small `device_tokens` table), tied to the member seat
  exactly like now. Update `supabase/schema.sql`.
- The `notify` Edge Function sends to web-push subscribers *and* native
  devices, so browser users keep working unchanged.
- Reuse the "Turn on notifications?" sheet built on 2026-09-28 as the moment
  we ask. Send as high priority so they reach the lock screen.

### Phase 4 — Invite links open the app
- A tapped invite link should open GroupTripIt if it's installed, otherwise the
  website (Universal Links on iPhone, App Links on Android).
- Both need a small verification file at the **root** of the web domain. With
  GitHub Pages at `timdreamboat.github.io/grouptrip/` we don't control the
  root. A custom domain (grouptripit.com — unregistered on 2026-09-28) solves it and
  looks better on the store page. Existing links keep working if the old
  address redirects.

### Phase 5 — Testing
- iPhone: TestFlight. Internal testers right away, external testers (up to
  10,000 by invite link) after a light Apple check.
- Android: internal testing track, then the required closed test (12+ testers,
  14 days) for a new personal account.
- Test on real phones: install, invite link opens the app, push on the lock
  screen, photo upload, receipts, offline, updating from an older version.

### Phase 6 — Store listings and submission
- Screenshots: iPhone 6.9" (plus 6.5"), Android phone. The demo trips (Tahoe,
  Orlando, Dreamforce) make good screenshots.
- Description, keywords, category (Travel), age rating questionnaire, support
  and privacy URLs.
- Privacy "nutrition label" (Apple) and Data safety form (Google). Honest
  answers: name/username, trip content, photos, and push tokens; no tracking or
  ads; Venmo/booking happen on their own sites.
- Payments: no problem. GroupTripIt sells nothing, and Venmo payments between
  people are allowed outside Apple's in-app purchase rules.
- Review typically takes 1–3 days on Apple, from hours to a few days on Google.
  First submissions often get one round of questions.

### Phase 7 — After launch
- **Updates:** the website and home-screen app still update the moment we
  push to `main`. The store apps update when we ship a new build through
  review, so native releases are batched (e.g. weekly), not every small fix.
  (Paid "live update" services exist; not needed at first.)
- Keep the web version and home-screen install alive. Invite links must work
  for people who never download anything.
- Free crash reporting (e.g. Firebase Crashlytics) to catch app-only problems.

## Rough size
Phases 1–4 are the bulk: roughly one focused session each, plus waiting on
accounts. Phases 5–6 are mostly waiting: the 14-day Google test and review
turnaround. Realistically **3–5 weeks** from "go" to both stores, mostly
calendar time, not building.

## Open questions for the owner (when we pick this up)
1. Individual or company developer accounts?
2. Buy a custom domain? Which name?
3. iPhone only, or iPad too?
4. Add the username PIN before submitting (recommended)?
5. Android first via the quick route, or both together with Capacitor
   (recommended)?
