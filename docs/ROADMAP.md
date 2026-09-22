# Roadmap

## v0 — local prototype (done)
- Create trips, add people, itinerary by day, log expenses with equal splits
- Balances and minimal settle-up payments
- Saves in the browser only

## v1 — share with the group
- Connect Supabase (free tier) using `supabase/schema.sql`
- Share a trip by link (anyone with the link can view/edit — no accounts yet)
- Publish `app/` on GitHub Pages

## v1.5 — outside services (see docs/API-RESEARCH.md)
- Flights: enter flight number + date → auto-fill airports/times (AeroDataBox), arrivals board
- Place search + map for itinerary (Google Places, Leaflet/OSM)
- Restaurant "Reserve" buttons via booking links (OpenTable/Resy partner APIs are invite-only)
- Venmo / PayPal.me pay buttons on Settle up
- Weather (Open-Meteo), calendar export (.ics), activities (Viator)

## v2 — nicer splitting
- Uneven splits (by amount / by shares), multiple currencies (Frankfurter rates)
- Mark payments as settled
- Categories and a spending summary

## Later ideas
- Date polls ("which weekend works?"), packing list, sign-in with email link
