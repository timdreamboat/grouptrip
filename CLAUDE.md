# CLAUDE.md — GroupTrip project context for Claude Code

Read this first in every session. The owner (Tim) works by giving plain-English
instructions. Do the work end-to-end and explain outcomes in one or two
sentences, not code detail.

## What GroupTrip is
A web app for planning a trip with a group of friends and splitting the costs.
One place for: who's coming, the itinerary, shared expenses, and a
"who owes whom" settle-up that uses the fewest possible payments.

## Architecture
- `app/` — no-build static PWA (plain HTML/CSS/JS, no framework, no npm).
  Open `app/index.html` directly or serve the folder; will be hosted on
  GitHub Pages.
- Data: **v0 stores everything in the browser (localStorage)** so it works
  with zero setup. `app/store.js` is the only file that touches storage —
  swapping to Supabase later means rewriting that one file.
- `supabase/schema.sql` — the planned shared database (trips, members,
  itinerary items, expenses, expense splits). Not connected yet.
- Money is stored in integer cents everywhere. Never use floats for totals.

## Standing conventions
- Everything free-tier unless the owner explicitly approves a cost.
- Small commits, plain-English messages.
- Settle-up math lives in `app/money.js`; if you change it, keep the rule that
  every balance sums to exactly zero (leftover cents from a split go to the first people in it).

## Roadmap
See `docs/ROADMAP.md`.
