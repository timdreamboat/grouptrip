# CLAUDE.md — GroupTrip project context for Claude Code

Read this first in every session, then `docs/HANDOFF.md` for current status,
owner decisions and what's pending. The owner (Tim) works by giving plain-English
instructions. Do the work end-to-end and explain outcomes in one or two
sentences, not code detail.

## What GroupTrip is
A web app for planning a trip with a group of friends and splitting the costs.
One place for: who's coming, the itinerary, shared expenses, and a
"who owes whom" settle-up that uses the fewest possible payments.

## The core rule — embed, don't rebuild
Every outside connection is shown as that site's own page or official widget,
embedded in GroupTrip (iframe). GroupTrip does no processing of partner data.
It stores the trip's shared details once (a single source) and assembles the embeds
into the best view for the whole group. If a site blocks embedding, show a
button that opens it in a new tab. Never scrape, never re-implement a partner's
feature. `docs/API-RESEARCH.md` lists which sites embed (tested).

Owner-approved exceptions (2026-09-22) — the only in-app processing allowed:
1. Flight times: look up scheduled departure/arrival from the flight number
   (AeroDataBox via a Supabase Edge Function; key never in `app/`).
2. Expense splitting and settle-up math (`app/money.js`).
3. Destination lookups (owner asked for location photos, 2026-09-22), in
   `app/places.js`: OpenStreetMap Nominatim geocodes the destination once (to
   position the Windy weather embed), and cover photos come from Wikipedia's
   lead image + Openverse (openly licensed). The organizer picks from a grid;
   the choice and its credit are stored on the trip. Wikimedia only serves
   standard widths (500, 960, 1280…) — other sizes return 400.
   Nominatim allows 1 request/second; `places.js` queues requests.
   Destination type-ahead (create page + trip editor) uses Photon
   (photon.komoot.io, free/keyless OSM search built for as-you-type; Nominatim
   forbids autocomplete). Picking a suggestion saves its lat/lon and shows
   Google's keyless map embed of it. Widget: `suggest()` in `ui.js`.
4. Calendar map is Google (owner: "OpenStreetMap doesn't work — use Google",
   2026-09-22). `views/tripmap.js` has two modes:
   - No key (today): Google's free embed (`maps.google.com/maps?q=…&output=embed`),
     one plan at a time. That embed centers on the place but draws NO marker,
     so we overlay our numbered pin at the center and hide it once the map is
     panned. Numbered chips switch plans and show the plan's card.
   - With `GOOGLE_MAPS_KEY` in `app/config.js`: Maps JavaScript API with a
     numbered AdvancedMarker per plan + info-window cards, and Google Places
     text search finds plan places when they're added (saved as lat/lon);
     older plans get pinned by the organizer's device. Key must be restricted
     to the site's URLs in Google Cloud. Untested until a key exists.
5. Exchange rates (owner asked for multi-currency, 2026-09-22): `rateTo()` in
   `app/money.js` fetches today's rate from Frankfurter (free, keyless). An
   expense in another currency is stored converted to the trip currency, with
   the original amount, currency and rate kept for display and editing.

## Architecture
- `app/` — no-build static web app (plain HTML/CSS/JS modules, no npm),
  published to GitHub Pages from `main` by `.github/workflows/pages.yml`.
  - `app.js` router · `store.js` the only file that talks to Supabase and
    keeps this device's identity · `ui.js` design primitives (icons, avatars,
    covers, sheets, toasts) · `money.js` split math · `embeds.js` partner URLs
  - `views/` one file per screen: `home` (trips list/landing), `create`,
    `invite` (what someone sees before joining), `trip` (shell), and the
    tabs `overview` (Home), `plan` (Calendar: plans + flights + check-ins),
    `flights` (Travel: stays + flights), `wallet` (Money), and the "Group"
    tabs — `polls`, `photos` (shared album + full-screen viewer), `lists`
    (who's bringing what + private packing list), `people`. Phones show five
    bar buttons (Home, Calendar, Travel, Money, Group); Group switches between
    its four with a pill row. Also `me` (settings, trip editor, "Good to
    know"), `stays`, `cover` (photo picker).
  - `style.css` is the design system (tokens, light/dark, mobile tab bar +
    bottom sheets, desktop sidebar + dialogs). Reuse its components.
- Data: Supabase project `grouptrip` (ref fnedxcktddvioxseogng, ca-central-1,
  free tier). Keep `supabase/schema.sql` in sync with every migration.
- Accounts (v7, owner 2026-09-23): organizers MUST sign in (Supabase Auth);
  invited people choose "Join as a guest" (name + email, no code; seat token
  saved on that device only) or "Join with an account". Sign-in: passkey,
  Google, Apple (button shown; needs the $99/yr Apple Developer account to
  work), or a 6-digit email code for any email; after an email sign-in we
  offer "Add a passkey". Consumer-first flow (owner, 2026-09-23): one
  sheet for sign-in and sign-up, Google first, "Continue with email", code
  auto-submits, resend timer, webmail shortcut, remembered email + "Last
  used" badge, passkeys via autofill. Creating a trip asks for sign-in only
  at the end ("Save your trip"; draft survives the Google round-trip).
  Invite page: name + email → "Join trip" (guest) or "Join with Google". `app/auth.js` wraps supabase-js (loaded lazily from
  jsDelivr, pinned version, so offline still works); `SIGN_IN` in config.js
  toggles options; `auth.ready()` reads Supabase's /auth/v1/settings so a
  button whose option isn't switched on says so in the sheet instead of
  sending people to an error page. Toasts are popovers (top layer) so they
  show above open sheets. Every seat (member) still has a secret token that all the
  share-code functions check, plus `members.user_id`: a seat linked to an
  account only works for that account (`_actor`, `_get_trip_all`), so copied
  links/shared devices can't act as an organizer. `my_trips()` returns the
  account's seats (tokens) for any device and links guest seats whose email
  matches the verified account email. Admins = emails in the `admins` table
  (owner: timmdonlon@gmail.com): `#/admin`, `admin_trips()`,
  `admin_trip_people()`, and they see all business expenses. Organizer-only:
  edit/delete trip, itinerary, add/remove people. Anyone joined: RSVP, own
  flight, expenses. Tables are locked (RLS, no policies); everything goes
  through the functions in `supabase/schema.sql` (Supabase advisor warnings
  about public SECURITY DEFINER functions are expected — that IS the access
  model). The old `#/me/<code>/<token>` private link is retired (route just
  opens the trip). Edge functions that act as a person must forward the
  caller's Authorization header (see `photos`).
- Edge Function `calendar` (verify_jwt OFF — calendar apps can't send auth)
  serves a subscribable .ics feed at `/functions/v1/calendar?trip=<share_code>`.
  Same access as the invite link; never include private lists, tokens or money.
- Edge Function `photos` (verify_jwt on) issues signed upload URLs into the
  public `trip-photos` bucket (folder = trip's internal id, never the share
  code), deletes single photos, and purges a trip's folder before the trip is
  deleted. Photos are shrunk on the device first (2048px + 640px thumb).
  Free tier storage is 1 GB — roughly 2,000+ photos across all trips.
- Notifications (v6): database triggers write to the `notifications` outbox
  (new poll, new plan, someone joins → organizer, expense share, trip dates
  set, guest adds a flight → organizer) and poke the `notify` Edge Function
  (verify_jwt OFF, checks `x-notify-secret`). pg_cron job `grouptrip-notify`
  runs every 15 min: 8am-local reminders (day before + each trip day) and a
  retry poke — it also keeps the free project from pausing. Delivery = web
  push (VAPID keys in `app_secrets`; public half in `app/config.js`) and email
  for members with `email_notify`. `app_secrets` holds server-only values —
  never commit them (repo is public).
- Email is SWITCHED OFF (owner, 2026-09-22: people use the browser or the
  installed app). `EMAIL_ENABLED = false` in `app/config.js` hides the email
  field, email updates and "Email me my link"; the server side stays deployed
  but idle. To turn it on: set the flag and add a provider key (below).
- Email (`_shared/email.ts`): Resend (`RESEND_API_KEY`) or Brevo
  (`BREVO_API_KEY`) + `EMAIL_FROM`, set as Edge Function secrets. Until one is
  set, email updates and "Email me my link" politely say email isn't set up.
  `email-link` function: send my link (token) / recover by email (always
  answers ok; link base URL comes from `app_secrets.site_url`, never the request).
- PWA: `app/manifest.webmanifest`, `app/sw.js` (network-first app files,
  offline fallback, push display). Add new app files to `SHELL` in sw.js.
  Trips are also saved in localStorage; offline shows the saved copy + banner.
  The Claude desktop preview browser can't run service workers — test
  install/push on a real phone.
- Edge Function `flight-lookup` is deployed and working; its `AERODATABOX_KEY`
  secret (RapidAPI, AeroDataBox free Basic plan) is set in the Supabase dashboard.
- Trip types (`trips.kind`: friends / family / business). Wording and
  suggestions come from `KINDS`/`words(trip)` in `views/common.js` — use it
  instead of hard-coding "crew", "Calendar", "Money". Business trips use
  `views/bizexpenses.js` (reimbursable: category, company card, receipt,
  reimbursed flag, CSV export, and a printable report in `views/bizreport.js` —
  summary, transactions, then each receipt photo; printed via the browser's
  print dialog, "Save as PDF" downloads it; card is always shown, wording changes once the trip has ended); non-organizers only receive their own
  expenses (enforced in `get_trip`, which wraps `_get_trip_all` — change trip
  contents in `_get_trip_all`). Family trips default expense splits to shares.
- Hotels: `stay_guests` says who stays where (a person can be at more than
  one, e.g. moving hotels). Map/plan cards show "From each hotel" (distance
  needs coordinates → Google key; Route opens Google Maps directions, since
  the keyless embed can't draw routes). `middleOf()` = guest-weighted center.
- Today (`views/today.js`) shows at the top of Home while the phone's local
  date is within the trip. Times are compared to the phone's clock (you're at
  the destination); flight status is estimated from scheduled times.
- Editing: every add form doubles as its edit form (pass the existing item).
  Same permissions as delete. `update_expense` replaces splits with
  `grouptrip.quiet` set so the split trigger doesn't re-notify.
- Lost device: account holders just sign in. Guests (or someone who joined
  with the wrong account): organizer's "Let back in" (`reset_member`) gives
  the seat a new token and un-joins/unlinks it; the real person taps their
  name on the invite link again. Their data and RSVP stay.
- Money is stored in integer cents everywhere. Never use floats for totals.
  Splits: equal / amounts / shares (`weightedShares` = largest-remainder so
  shares always sum exactly). Settlements ("mark as paid") count in
  `balances()`. Receipts live in the trip's photo folder (not the album).

## Design direction
Modern (2027) consumer app, mobile-first. References: Partiful/Luma (invite
page), Flighty (boarding-pass flight cards), Splitwise/Tricount (balances
framed around *you*), Wanderlog (day timeline). Organizer and guest must feel
different: organizer home = planning dashboard (invite, readiness, waiting
on); guest home = RSVP, personal to-dos, balance, next up.

## Standing conventions
- Everything free-tier unless the owner explicitly approves a cost.
- Small commits, plain-English messages.
- Settle-up math lives in `app/money.js`; if you change it, keep the rule that
  every balance sums to exactly zero (leftover cents from a split go to the first people in it).

## Roadmap
See `docs/ROADMAP.md`. Which connections embed and how: `docs/API-RESEARCH.md`.
API keys never go in `app/` — secret-key calls go through Supabase Edge Functions.
