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

## Architecture
- `app/` — no-build static PWA (plain HTML/CSS/JS, no framework, no npm).
  Open `app/index.html` directly or serve the folder; will be hosted on
  GitHub Pages.
- Data: Supabase project `grouptrip` (ref fnedxcktddvioxseogng, ca-central-1,
  free tier). `app/store.js` is the only file that touches storage; it falls
  back to browser-only storage if `app/config.js` is emptied.
- Access = share link. No accounts. Tables have RLS on with no policies and
  are revoked from anon; everything goes through share-code functions in
  `supabase/schema.sql` (the Supabase advisor warnings about public
  SECURITY DEFINER functions are expected — that IS the access model).
  Keep `supabase/schema.sql` in sync with every migration.
- Edge Function `flight-lookup` is deployed; it needs the `AERODATABOX_KEY`
  secret before it returns data.
- Money is stored in integer cents everywhere. Never use floats for totals.

## Standing conventions
- Everything free-tier unless the owner explicitly approves a cost.
- Small commits, plain-English messages.
- Settle-up math lives in `app/money.js`; if you change it, keep the rule that
  every balance sums to exactly zero (leftover cents from a split go to the first people in it).

## Roadmap
See `docs/ROADMAP.md`. Which connections embed and how: `docs/API-RESEARCH.md`.
API keys never go in `app/` — secret-key calls go through Supabase Edge Functions.
