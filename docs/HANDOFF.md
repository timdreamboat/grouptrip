# Handoff — where GroupTrip stands (2026-09-22)

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

## Working with the owner (Tim)
- Non-technical; wants plain-English outcomes, end-to-end work, tested before
  reporting. Explain results in a sentence or two, not code.
- Test with throwaway trips (API or UI) and delete them afterwards.
  **Never touch the owner's real trip "las vegas trip".**
- Every schema change: apply via migration AND append it to
  `supabase/schema.sql` (the file must stay the source of truth; the current
  trip builder is `_get_trip_all`, wrapped by `get_trip`).
- Commit small with plain-English messages ending with the Co-Authored-By
  line; push to `main` (that deploys).

## What's built (all live)
- Accounts (2026-09-23): organizers sign in (email code / Google / passkey;
  Apple ready but off); guests can join with just name + email or with an
  account; admin page `#/admin` for the owner. The database was wiped for
  this (owner: "nothing is live yet").
- Trips with organizer vs guest roles; invite page with "tap your name";
  organizer "Let back in" for guests/wrong-account joins.
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

## Pending on the owner
0. **Sign-in setup in the Supabase dashboard** (until done, only the email
   code works, and only for a few emails an hour to the project team's own
   addresses):
   - Email: Authentication → Emails → SMTP → custom SMTP with Brevo (free,
     300/day, verify a single sender — no domain needed; Resend needs your
     own domain). Edit the "Magic Link" template so it shows the code:
     `Your GroupTrip code is {{ .Token }}`.
   - URLs: Authentication → URL Configuration → Site URL
     `https://timdreamboat.github.io/grouptrip/`, redirect URLs add
     `https://timdreamboat.github.io/grouptrip/**` and `http://localhost:8080/**`.
   - Google: Google Cloud → OAuth client (Web), redirect URI
     `https://fnedxcktddvioxseogng.supabase.co/auth/v1/callback`; paste the
     client ID/secret into Authentication → Sign In / Providers → Google.
     Set the consent screen to "In production".
   - Passkeys: Authentication → Passkeys → enable; RP ID
     `timdreamboat.github.io`, name `GroupTrip`, origins
     `https://timdreamboat.github.io,http://localhost:8080`. (Changing the
     domain later invalidates passkeys.)
   - Apple (optional, $99/yr Apple Developer account): then set
     `SIGN_IN.apple = true` in `app/config.js`.
1. **Google Maps key** → paste into `app/config.js` `GOOGLE_MAPS_KEY` (and
   optionally a Map ID in `GOOGLE_MAP_ID`). Unlocks: all pins at once,
   info-window cards, Google Places lookup for plan/hotel locations,
   distances while adding plans, "Middle of everyone" marker. **This code path
   is written but untested** — test it as soon as the key arrives (restrict the
   key to `https://timdreamboat.github.io/*` and `http://localhost:8080/*`,
   APIs: Maps JavaScript API + Places API (New)).
2. **Phone test** of Add to home screen + notifications (server-side sending
   is verified; the device side isn't).

## Known small quirks
- Rejoining after "Let back in" sends the organizer a "joined" notification again.
- Flight "Landed / In the air" on Today is estimated from scheduled times.
- Keyless Google map can't draw routes; "Route" opens Google Maps directions.
- Deleting a single expense leaves its receipt file in storage until the
  trip is deleted (trip delete purges the whole folder).

## Ideas not yet built
- Activity feed ("Ana added her flight · Raj voted")
- Expense categories/summary for non-business trips
- Local time + currency on Home; photo reactions
