# Handoff — where GroupTripIt stands (updated 2026-09-28)

Read this after `CLAUDE.md` when starting a new session. `CLAUDE.md` explains
how the app is built and the rules; this file is **current status, decisions
and what's pending**.

## Links
- Live app: https://timdreamboat.github.io/grouptrip/ (GitHub Pages, deploys
  from `app/` on every push to `main`, about 1 minute)
- Repo: https://github.com/timdreamboat/grouptrip (public; never commit secrets)
- Supabase project: `grouptrip`, ref `fnedxcktddvioxseogng`, ca-central-1, free plan
  (the Supabase MCP connector can run SQL, apply migrations and deploy functions,
  but cannot create projects or set function secrets — the owner does those in
  the dashboard)
- Local preview: serve `app/` with no caching, for example
  `python3 -m http.server 8080 -d app` (browsers may cache modules; add `?v=N`
  to the URL). The Claude desktop preview browser cannot run service workers,
  so install/offline/push must be tested on a real phone.

## Usernames instead of sign-in (owner, 2026-09-24)
- Owner: "Remove login functionality and just do username and tie the
  username to each trip the user has." Sign-in (email code, Google, Apple,
  passkeys) and the admin page are gone. People pick a username; typing it on
  any device brings back every trip under it.
- PIN + passkeys (2026-09-28, v13): each username has a 6-digit PIN; a
  passkey (Face ID / fingerprint) is optional and offered after the PIN
  ("Not now" asks again in 3 days, 3 times max). See CLAUDE.md for details.
  **All demo-* usernames have PIN `246810`.** @timd had no PIN when this
  shipped — the app asks Tim to set one next time My trips opens.
- To test roles: use different usernames in private windows.
- Supabase Auth settings in the dashboard are now unused (nothing to set up).

## GigTrip (new, 2026-09-23 — mock only)
- A "next level" for music artist managers + touring party (tours, shows,
  day sheets, advancing, deals/settlement, tour budget). Separate site and
  brand, built on GroupTripIt later.
- Clickable mock: `gigtrip/mock/index.html` (one file, fake data, no
  database). **Public link to share:** https://timdreamboat.github.io/grouptrip/gigtrip/
  (the Pages workflow copies it in next to the app). Private preview:
  https://claude.ai/artifact/6ckEWFC9bMBHE2iFr7d1UY
- **Two project skills** (in `.claude/skills/`, GigTrip only): `gigtrip-qa`
  — run after any change to the mock (static check + an in-browser harness
  that exercises every role, page, form, import/undo, settlement math and
  light/dark contrast); `gigtrip-uat` — walk the app as each persona and list
  what to adjust (reports go in `gigtrip/uat/`).
- Spec to build from: `docs/GIGTRIP-SPEC.md`. Waiting on manager feedback
  before any real build. Deal/settlement math would be a new in-app
  processing exception — needs owner approval.

## Demo trips (owner, 2026-09-28)
The owner's real trips were cleared; the database holds four demo trips for
demos and testing. Organizer everywhere: **@timd** (Tim). Shared guest in all
four: **@demo-guest** (Sam Rivera) — type it on home to see the guest view.
- Lake Tahoe Friends Weekend (friends, Sep 26–30 2026 — "happening now" for
  the Today screen): 6 people incl. one maybe + one not joined, flights,
  cabin, 9 plans, 5 split expenses + a settlement, 2 polls, lists.
- Orlando Family Christmas (family, Dec 19–26): household shares 4/2/1/3,
  two hotels (who stays where), 7 plans, poll, lists.
- Dreamforce — Sales Team (business, group, Oct 13–16): 5 people, plans for
  specific people (breakouts, customer meetings), 2 hotels, reimbursable
  expenses incl. company card.
- Company All-Hands Summit 2026 (business, PRIVATE, Nov 4–6): 42 people (36
  joined, 6 pre-added), Tracks A/B/C + leadership + volunteer plans for
  subsets, 24 flights, 2 hotels, 14 expenses.
Trips where @timd is NOT the organizer (added 2026-09-28, to see each role):
- Nashville Bachelor Party (friends, org @demo-marcus): Tim is a guest who
  owes money, hasn't added a flight or voted, is bringing the shirts.
- Thanksgiving at the Lake House (family, org @demo-rose): Tim RSVP'd maybe.
- AWS re:Invent — Engineering (business group, org @demo-elena): Tim has his
  own sessions + reimbursable expenses.
- Hope Foundation Charity Gala (business PRIVATE, org @demo-priya, 60 people):
  Tim sees only himself + Priya, his own plans/expenses.
- Cabo Birthday Getaway (friends, org @demo-dana): Tim pre-added but NOT
  joined — invite page: https://timdreamboat.github.io/grouptrip/#/t/fcbbbeaced46482b924f5955280eead3
  (once he taps his name it becomes a normal guest trip; "Let back in" as
  @demo-dana resets it).
Other demo usernames: demo-priya, demo-marcus, demo-dana, demo-rose,
demo-mike, demo-elena, and summit attendees like demo-olivia.p.
Covers for Tahoe, SF and Orlando were set by hand (before the picker fix);
the five later trips got theirs from the fixed automatic picker.
Demo trip share codes: Tahoe 9d77adeaac63485f94132ef21cbf9fb9, Orlando
b7397ecbcca34404b9e31f89021e01ec, Dreamforce 0c41ee10618048edac9cb83e78bdc57a,
Summit a2270a34970043edb35510bc504af8c8, Nashville 17d3e50c642840e29e60c8ecdbb43e8c,
Thanksgiving 256ee10c0d0144e0a4cc6c30d0c9f0a4, re:Invent c37f8a0ea61d4d7f8accff6afdfccf5b,
Gala b49cb13039194ddd910633d8bf88b0a9, Cabo fcbbbeaced46482b924f5955280eead3.
Don't delete or change demo trips unless the owner asks; use throwaway "ZZ …"
trips with "zz-…" usernames for tests and delete them after.

## Working with the owner (Tim)
- Non-technical; wants plain-English outcomes, end-to-end work, tested before
  reporting. Explain results in a sentence or two, not code.
- Test with throwaway trips (API or UI) and delete them afterwards. The
  owner's real trips were cleared on request (2026-09-28); only demo trips
  exist now (see above).
- Design consumer-first: familiar patterns from mainstream apps (Airbnb,
  Partiful, Slack), fewest steps, no dead buttons, errors shown where the
  person is looking.
- Every schema change: apply via migration AND append it to
  `supabase/schema.sql` (the file must stay the source of truth; the current
  trip builder is `_get_trip_all`, wrapped by `get_trip`).
- Commit small with plain-English messages ending with the Co-Authored-By
  line; push to `main` (that deploys).

## Recent work (2026-09-24 → 09-28, all live)
- Safe outside connections (v9): links only plain https (DB CHECK +
  `safeUrl`), "Book on <site>", Venmo handle rules, pay button names the
  handle, recent-change warning + alert. Venmo link = account.venmo.com/pay.
- Service worker fetches app files with `cache: 'no-cache'` (no old/new mix
  after deploys); DB refusals shown in plain English (`friendly()` in store.js).
- Business privacy (v10): `trips.privacy` group/private, plans for specific
  people (`for_members`), "Showing: Everyone/My/<person>'s schedule".
- Personal calendar feed (v11): per-person `calendar_key`, `&me=` on the
  calendar function, "My schedule / Everyone's", "Get a new one".
- My trips (v12): stale/deleted cards pruned (`existing_trips`), card "⋯"
  menu → Delete trip (organizer) / Leave trip (guest, `leave_trip`).
- Cover picker: Wikidata P18 → place's Wikipedia photo → Flickr extras.
- Notifications prompt (2026-09-28): opening a trip from the home-screen app
  with notifications off shows a "Turn on notifications?" sheet
  (`askForNotifications` in views/getapp.js). "Not now" asks again after 3
  days, 3 times max; never asks once the phone has blocked them. Owner's
  iPhone push confirmed working (test sent 2026-09-28).

## What's built (all live)
- Usernames (2026-09-24): no sign-in; a username ties each person's trips
  together across devices (replaced the 2026-09-23 accounts + admin page).
- Trips with organizer vs guest roles; invite page with "tap your name";
  organizer "Let back in" for wrong-username joins.
- Business "Who can see what" (2026-09-28): whole group vs each person sees
  only their own (big events); plans can be for specific people; Calendar
  shows everyone's or one person's schedule.
- Trip types: Friends / Family / Business (wording, suggestions; business =
  reimbursable expenses with receipt photos, CSV export and a printable
  expense report with the receipts (print or Save as PDF), private per person; family = shares).
- Home: planning dashboard (organizer) or RSVP + to-dos (guest); **Today**
  screen during the trip; weather (Windy embed); good-to-know notes; open polls;
  photo strip; install/notifications card.
- Calendar/Agenda: day timeline of plans + flights + check-ins; always-open
  Google map (keyless embed, one place at a time with our numbered pin);
  hotel pins with guests' faces; "From each hotel" distances/routes;
  subscribable .ics feed (Apple/Google/Outlook).
- Travel: stays (who's staying where) + flights (boarding passes, automatic
  times via AeroDataBox, live map).
- Money: equal / amounts / shares splits, other currencies (Frankfurter),
  receipts, settle up with Venmo, mark as paid, payment history.
- Group: polls (dates or anything; lock in winner), shared photo album, lists
  (shared + private packing), people.
- Editing everywhere (✎ next to 🗑).
- Installable PWA with offline saved copy; web push notifications
  (triggers → `notifications` outbox → `notify` Edge Function; pg_cron every
  15 min for 8am reminders, also keeps the free project awake).
- Clear "My trips" button (phone top bar) and sidebar row (desktop).

## Decisions the owner made (don't re-ask)
- Embed-first rule with approved exceptions (see CLAUDE.md): flight-time
  lookup, expense math, destination lookups/cover photos, Google map,
  exchange rates.
- OpenStreetMap map tiles rejected — use Google.
- Supabase stays in Canada Central.
- Email is **off** (`EMAIL_ENABLED = false`); people use the browser or the
  installed app. Server side is built but idle.
- "Before sharing" items (rate limiting, backups, privacy note) — **skipped**
  by the owner for now.
- App renamed **GroupTripIt** (2026-09-28; grouptrip.com was taken). Shown
  everywhere people see it. Internal names stay `grouptrip` on purpose: the
  repo, Pages URL, Supabase project, localStorage keys (renaming would lose
  people's saved trips), calendar event UIDs (renaming would duplicate events
  in calendar apps) and the `grouptrip.quiet` setting.

## Pending on the owner
- **Claim the name** — grouptripit.com (and grouptripit.app) were
  unregistered on 2026-09-28, and @grouptripit looked free on Instagram,
  TikTok, X, Facebook, YouTube, Pinterest, Bluesky and GitHub. Once the
  domain is bought, point GitHub Pages at it (see `docs/APP-STORES.md`).
1. **Google Maps key** → paste into `app/config.js` `GOOGLE_MAPS_KEY` (and
   optionally a Map ID in `GOOGLE_MAP_ID`). Unlocks: all pins at once,
   info-window cards, Google Places lookup for plan/hotel locations,
   distances while adding plans, "Middle of everyone" marker. **This code path
   is written but untested** — test it as soon as the key arrives (restrict the
   key to `https://timdreamboat.github.io/*` and `http://localhost:8080/*`,
   APIs: Maps JavaScript API + Places API (New)).
2. ~~Phone test of notifications~~ — owner's iPhone subscribed 2026-09-28;
   test push sent and accepted by Apple.

## Lessons for working in this repo
- The preview browser caches JS modules: after editing, run
  `fetch('/<file>', {cache:'reload'})` for changed files, then reload the page
  (a page already running keeps the old module). A stopped preview server can
  still "serve" via the service worker's cache — restart it with preview_start.
- Screenshots fail when the browser pane is hidden; verify with
  javascript_tool / get_page_text, or download images and view them.
- Test identities: usernames + PIN — `store.signedIn(await store.createPin('zz-…', '<6 digits>'))`
  for a new one, `store.signedIn(await store.unlockWithPin(u, pin))` for an
  existing one, `store.forgetUsername()` between people, `localStorage.clear()`
  at the end; delete test rows from `usernames` too (cascades devices/passkeys).
- Passkeys can't be tested with a real authenticator in the preview (it would
  pop a Touch ID prompt on the owner's Mac). A software-authenticator script
  (Node: P-256 key + hand-built CBOR, "none" attestation) tested the whole
  server flow on 2026-09-28; the real Face ID test is on the owner's phone.
- `.claude/launch.json` has `app-8081` for when another session holds 8080
  (8081 is also an allowed passkey origin).
- The permission checker blocked (don't retry): an admin "test as someone
  else" login without codes, and signing people in from an email with no
  proof. Deploys/migrations normally go through.
- Other sessions work in this repo too (GigTrip mock in `gigtrip/`): always
  `git pull` first.
- Supabase Auth has Brevo SMTP configured by the owner but it's unused since
  usernames replaced sign-in.

## Possible next steps (owner hasn't chosen)
- App Store + Google Play (native apps): plan drafted in
  `docs/APP-STORES.md` (Capacitor shell around `app/`). Owner: no changes yet.
- South Lake Tahoe's Wikidata photo is a dusk street scene (picker's one weak
  spot seen); could prefer lake/landmark photos for lake destinations.
- Google Maps key test; phone test of install + push (below).
- Ideas list at the bottom.

## Known small quirks
- The very first visit after an update can use the browser's saved copies
  for a few minutes; after that the service worker always re-checks files.
- Rejoining after "Let back in" sends the organizer a "joined" notification again.
- Flight "Landed / In the air" on Today is estimated from scheduled times.
- Keyless Google map can't draw routes; "Route" opens Google Maps directions.
- Deleting a single expense leaves its receipt file in storage until the
  trip is deleted (trip delete purges the whole folder).

## Ideas not yet built
- Activity feed ("Ana added her flight · Raj voted")
- Expense categories/summary for non-business trips
- Local time + currency on Home; photo reactions
