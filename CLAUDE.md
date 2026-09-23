# CLAUDE.md — GroupTrip project context for Claude Code

Read this first in every session. The owner (Tim) works by giving plain-English
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

## Architecture
- `app/` — no-build static web app (plain HTML/CSS/JS modules, no npm),
  published to GitHub Pages from `main` by `.github/workflows/pages.yml`.
  - `app.js` router · `store.js` the only file that talks to Supabase and
    keeps this device's identity · `ui.js` design primitives (icons, avatars,
    covers, sheets, toasts) · `money.js` split math · `embeds.js` partner URLs
  - `views/` one file per screen: `home` (trips list/landing), `create`,
    `invite` (what someone sees before joining), `trip` (shell), and the
    tabs `overview` (Home), `plan` (Calendar: plans + flights + check-ins),
    `flights` (Travel: stays + flights), `wallet` (Money), `lists` (who's
    bringing what + private packing list), `people` (sidebar/Home only), plus
    `me` (settings, trip editor, "Good to know"), `stays`, `cover` (photo
    picker).
  - `style.css` is the design system (tokens, light/dark, mobile tab bar +
    bottom sheets, desktop sidebar + dialogs). Reuse its components.
- Data: Supabase project `grouptrip` (ref fnedxcktddvioxseogng, ca-central-1,
  free tier). Keep `supabase/schema.sql` in sync with every migration.
- Roles, no accounts: the invite link (`#/t/<share_code>`) lets anyone view and
  join; joining gives a secret per-person token saved on that device. The
  organizer is the member with `is_organizer`; organizer-only: edit/delete
  trip, itinerary, add/remove people. Anyone joined: RSVP, own flight,
  expenses. `#/me/<code>/<token>` is a person's private link for another
  device. Tables are locked (RLS, no policies); everything goes through the
  functions in `supabase/schema.sql` (Supabase advisor warnings about public
  SECURITY DEFINER functions are expected — that IS the access model).
- Edge Function `calendar` (verify_jwt OFF — calendar apps can't send auth)
  serves a subscribable .ics feed at `/functions/v1/calendar?trip=<share_code>`.
  Same access as the invite link; never include private lists, tokens or money.
- Edge Function `flight-lookup` is deployed and working; its `AERODATABOX_KEY`
  secret (RapidAPI, AeroDataBox free Basic plan) is set in the Supabase dashboard.
- Money is stored in integer cents everywhere. Never use floats for totals.

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
