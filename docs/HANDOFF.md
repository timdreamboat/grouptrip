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
- PIN recovery by email (2026-10-01, v14): optional recovery email per
  username → "Forgot PIN? → Email me a reset code". **Owner to-do:** set
  `BREVO_API_KEY` (from Brevo → SMTP & API → API keys) and `EMAIL_FROM`
  (a sender verified in Brevo, e.g. your Gmail) as Edge Function secrets in
  the Supabase dashboard (Edge Functions → Secrets). Until then the button
  says email isn't set up. The database side was tested end to end with a
  simulated code on 2026-10-01.
- The owner forgot @timd's PIN on 2026-10-01; the permission checker refused
  to clear it from here. Fix: `delete from usernames where username = 'timd'`
  in the SQL editor (then the app asks for a new PIN), or Change PIN on a
  still-signed-in device.
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
- **Three project skills** (in `.claude/skills/`, GigTrip only): `gigtrip-qa`
  — run after any change to the mock (static check + an in-browser harness
  that exercises every role, page, form, import/undo, settlement math and
  light/dark contrast); `gigtrip-uat` — walk the app as each persona and list
  what to adjust (reports go in `gigtrip/uat/`).
  `gigtrip-ui-qa` (added 2026-10-13) — layout harness at four widths (phone,
  tablet, desktop, wide) for empty gaps, orphaned controls, overlaps, clipped
  text, small tap targets, broken pictures, plus an eye-test checklist. Order
  for every major GigTrip change: gigtrip-qa → gigtrip-ui-qa → code review →
  publish.
- Cancel or postpone a show (2026-11-17, owner asked how an artist's
  cancellation should reach everyone and the fans): management taps
  **Cancel or postpone** on the show page (`E.cancel`). One form: cancelled
  or postponed (+ new date), reason (private unless ticked), what ticket
  holders are told, and who to tell — promoter + venue, band + crew,
  management + agent, guest-list requesters. The show becomes
  `status: 'cancelled'` with `show.cancel` (who was told, seen flags — made
  up in the mock, read receipts in the real build — and the previous status
  so **Put the show back** works). Everyone's landing page carries a notice
  worded for them (`cancelCard`). A fan statement is drafted in three
  lengths (`fanStatement`); the artist is told not to post until management
  approves it (`E.statement`), then gets Copy, Share and "Open in…" buttons
  for X, Threads, Bluesky, Instagram, TikTok and Facebook (`NETWORKS`, like
  "Open in Maps": the text is copied, then the person's own app opens; the
  first three accept the post pre-written, the others open for a paste).
  **Owner-level decision baked in: GigTrip never posts to social media and
  never holds social logins** — the artist posts from their own apps.
  Needs attention lists unseen notices and an unapproved statement.
- Also 2026-11-17: **Promoter** is its own demo role (Nina). Venue
  production staff no longer see the settlement (`access.venue.costs = off`);
  a promoter rep gets it through their own card. Guest-list requests close
  at the show's cut-off (`show.guestClose`, default 5 pm venue time);
  management can still add.
- Going live (2026-11-17): owner chose **per-artist pricing** ($39 per active
  artist a month, $29 from the sixth; every role included). Sales document:
  https://claude.ai/artifact/W8QpETQ3LsDjg4To1vhrDc · Go-live checklist (ordered,
  with the services to sign up for): https://claude.ai/artifact/FZPT3VzVPpEyvnGKLR98MT
  **Waiting on the owner:** approval + organization name to create a private
  `gigtrip` repository and move everything GigTrip out of this public repo
  (the competitor analysis is public today); Omnipath templates; AWS and
  Google Cloud accounts. Nothing has been moved or deleted yet.
- Switch from RoadOps / Master Tour (2026-11-17, owner: "build the import
  from RoadOps and Master Tour"): two sources in the import wizard marked
  "switch everything" (`SWITCH`). The Files step takes several exports at
  once (plus a day sheet pasted as text), recognises each by its columns and
  file name (`detectKind` + `FILE_HINTS`), lets you fix any with **Columns**,
  previews the whole lot on a copy of the data (`runBatch(true)`, `SIM`
  stops saving) and imports in dependency order (`BATCH_ORDER`): shows →
  team → travel → rooming list → guests → settlement lines → day sheet. New
  import kinds: `people` (Party, always as Band & crew), `rooms` (hotel +
  room on each person's card, old rooms restored on undo), `lines`
  (settlement costs in cents; income rows skipped), `daysheet`. Each file is
  its own import record, so each can be undone.
  **Not verified against real exports**: neither company publishes its
  column names (Master Tour documents three CSV exports — Tour Details,
  Tour Personnel, Line Items — without columns; RoadOps documents none).
  `gigtrip/demo/switch/` holds our own example files in a typical layout
  (see its README); the wizard's "Try it with example files" loads them.
  When a real export arrives, run it through and add its header words to
  `IMPORT_KINDS`.
- Custom views (2026-11-17, owner: "flexibility for users to customize their
  view" — the gap against RoadOps, see `docs/GIGTRIP-VS-ROADOPS.md`):
  - Each person (`DB.prefs[person]`, `DB.views[person]`): Season table
    **Columns** picker (tick + reorder, `boardCols()`/`myCols()`), **saved
    views** (filters, sort, columns, artist under a name; `viewBar()`), and a
    **Customize** button on both home pages that picks and orders cards
    (`HOME_CARDS`; management gets Shows today, Needs attention, Deposits to
    chase, Open offers; artists/crew get Next show, My next travel).
  - The company (`DB.fields`, `DB.settings.org`): **custom fields** on every
    show (text, number, date, yes/no, pick-list; management-only or everyone
    on the tour — never the venue) that appear on the show form, show page,
    as table columns and in exports; **company name + accent colour**
    (Settings › Your company, `applyBrand()` overrides `--tape`).
  - Older saved data gets the new shape through `ensureShape()`.
- Times (2026-10-26, owner: "based on the setting the user has on their
  device, or local to where the user is and where the show is"): times and
  dates format through `Intl` with the device's locale (12/24-hour, language).
  Every show has a zone from its city's state/province (`TZ_REGION`, `showTz`),
  flights from the airport (`TZ_AIRPORT`), hotels from the address; stored
  times stay venue-local "HH:MM". When the device is in another zone, the day
  sheet says "Times are New York local (EDT) · 2 hours ahead of you" and each
  line adds "10:00 AM your time"; boarding passes show the zone next to each
  time. The clock is live: `NOW.min` is the device's real time (`nowIn(tz)`
  for the venue), so "Now" and "in N min" move during a demo. The sample show
  day stays Apr 12, 2027 so the demo always lands on a show. The old
  "mock clock 4:05 pm" note is gone.
- Travel in the mock (2026-10-08, owner: "similar functionality as GroupTrip
  for flights, hotels and OpenTable"): flights are boarding passes (number,
  date, FROM time → TO time, confirmation, Live map / FlightAware, "Find my
  flight" fills times from a small mock timetable — real build: AeroDataBox);
  hotels are cards with check-in/out, nights, who is in which room (rooms
  from each person's card in Party), confirmation, Directions, booking site;
  van legs unchanged. Day-sheet lines take an OpenTable link/ID → "Reserve on
  OpenTable" opens OpenTable's own booking screen in a dialog (party size =
  people on the road, time from the line) + "Book on <site>" for other links.
  Today shows the hotel with your room and your flight if you fly that day.
  Imported travel rows get the structured fields (`enrichTravel`). The QA
  harness (`.claude/skills/gigtrip-qa`) checks all of it. Pushed to `main`
  (live at /gigtrip/ on Pages); the Artifact preview link was NOT republished
  from this session — republish it from the GigTrip session.
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
- "Before sharing" items: privacy page, delete-my-data and photo reports were
  built 2026-11-17 (see CLAUDE.md → Privacy basics). Rate limiting and
  backups are still skipped.
- Public contact email: none for now (owner, 2026-11-17). Add one on the
  7 Wood Systems domain once the app moves to AWS and goes live under that
  brand; the privacy page has a placeholder sentence.
- App renamed **GroupTripIt** (2026-09-28; grouptrip.com was taken). Shown
  everywhere people see it. Internal names stay `grouptrip` on purpose: the
  repo, Pages URL, Supabase project, localStorage keys (renaming would lose
  people's saved trips), calendar event UIDs (renaming would duplicate events
  in calendar apps) and the `grouptrip.quiet` setting.

## Business front door + demo event (2026-11-17, first draft)
Owner asked whether to sell a business version; decision: same app, a second
front door aimed at company events (offsites, kickoffs, conference teams).
- Landing page: https://timdreamboat.github.io/grouptrip/business.html
  (`app/business.html`, a plain static page like privacy.html; screenshots in
  `app/img/biz-*.jpg` are of the demo event). Linked from the home footer.
  "GroupTripIt for teams" is a working name. The page says pricing is free in
  pre-release and will be set with pilot teams, and "best up to about 60
  people" — both are the owner's to confirm. No contact email on it yet
  (waiting on the 7 Wood Systems domain), so the only actions are "see the
  demo" and "set up your event".
- One-tap demo: `#/demo/attendee` and `#/demo/organizer` sign the device in
  as `@demo-attendee` (Alex Morgan) / `@demo-planner` (Jordan Lee) and open
  "Acme Sales Kickoff 2027" (business, PRIVATE, Scottsdale, Feb 9–11 2027,
  28 people — 24 joined, 4 pre-added; share code
  de3005a1e5c1c0ff2027ac3e00000001). Someone with their own username on the
  device is asked first. Home shows a "Demo event" banner with a switch to
  the other role. `DEMO` in `app/config.js`.
- `#/new/business` starts Create with Business picked and event wording.
- Protection (v18): `usernames.demo` + `_demo_guard` — demo usernames can't
  delete the event or the username, leave, remove/reset people, or change
  the PIN / recovery email; wrong PINs on them aren't counted.
- Reset: visitors CAN click around (RSVP, add plans, vote, add expenses), so
  the event drifts. `supabase/demo/kickoff.sql` deletes and rebuilds it — run
  the whole file in the SQL editor. NOT automatic: a nightly reset job and a
  block on photo/receipt uploads from demo usernames were drafted on
  2026-11-17 but not applied (needs the owner's OK). After Feb 11, 2027 the
  event reads as finished; change `d0` in the file and re-run.
- Fixed on the way: business Expenses header ran off a phone screen
  (`.page-head` wraps); organizer People rows now have one "⋯" button
  (Let back in / Remove) so names aren't squeezed to a letter.

## Pending on the owner
0. **Email secrets for PIN recovery** — see "PIN recovery by email" above.
   Since 2026-11-17 the app hides every recovery-email prompt until these
   exist, and shows them by itself once they do (no deploy needed).
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
- Events inside the app: "Find places → Events & concerts" opens the ticket
  sites today. Real in-app listings (what's on during the trip dates, "Add to
  plan" with the ticket link) need a free Ticketmaster Discovery API key
  (developer.ticketmaster.com) set as an Edge Function secret — offered to
  the owner 2026-11-17, not built.
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
