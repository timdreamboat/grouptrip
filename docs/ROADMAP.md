# Roadmap

## v0 — local prototype (done)
- Create trips, add people, itinerary by day, log expenses with equal splits
- Balances and minimal settle-up payments
- Saves in the browser only

## v1 — share with the group (live — Supabase project `grouptrip`, Canada Central)
- Connect Supabase (free tier) using `supabase/schema.sql`
- Share a trip by link (anyone with the link can view/edit — no accounts yet)
- Publish `app/` on GitHub Pages

## v1.5 — embedded connections (see docs/API-RESEARCH.md)
- ✅ Flights tab: arrivals board, embedded live flight map (adsb.fi), FlightAware link
- ✅ Automatic flight times (AeroDataBox via Edge Function, key set 2026-09-22)
- ✅ OpenTable booking embedded in itinerary items; other booking sites as links
- ✅ Embedded maps for the destination and each place
- ✅ Venmo buttons on Settle up
- Next: weather (Windy embed), shared Google Calendar embed

## v1.6 — redesign (2026-09-22)
- ✅ Organizer vs guest roles; Partiful-style invite page; claim a pre-added name
- ✅ New design system, mobile tab bar + bottom sheets, desktop sidebar, dark mode
- ✅ Venmo buttons go straight to the person when they've added their username

## v2 — nicer splitting
- Uneven splits (by amount / by shares), multiple currencies
- Mark payments as settled
- Categories and a spending summary

## Later ideas
- Date polls ("which weekend works?"), packing list, sign-in with email link
