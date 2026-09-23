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


## v1.6 — redesign (2026-09-22)
- ✅ Organizer vs guest roles; Partiful-style invite page; claim a pre-added name
- ✅ New design system, mobile tab bar + bottom sheets, desktop sidebar, dark mode
- ✅ Venmo buttons go straight to the person when they've added their username

## v1.7 — everything for the trip (2026-09-22)
- ✅ Destination cover photos (pick from a grid), weather (Windy embed with forecast)
- ✅ Calendar tab merging plans, flights and check-ins; subscribe in Apple/Google/Outlook
- ✅ Where we're staying; "Good to know" notes; who's bringing what; private packing lists

## v1.8 — decide & remember (2026-09-22)
- ✅ Polls (dates or anything); organizer locks in the winner as trip dates or a plan
- ✅ Shared photo album with full-screen viewer; photos shrunk on-device before upload

## v1.9 — plan map (2026-09-22)
- ✅ Calendar map always open; each plan with a found place gets a numbered pin
- ✅ Pin card: plan, place, date, time, notes, directions

## Ideas next
- Pins for where we're staying
- Local time + currency on Home; photo reactions; notifications when a poll opens

## v2 — nicer splitting
- Uneven splits (by amount / by shares), multiple currencies
- Mark payments as settled
- Categories and a spending summary

## Later ideas
- Date polls ("which weekend works?"), packing list, sign-in with email link
