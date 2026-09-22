# Roadmap

## v0 — local prototype (done)
- Create trips, add people, itinerary by day, log expenses with equal splits
- Balances and minimal settle-up payments
- Saves in the browser only

## v1 — share with the group
- Connect Supabase (free tier) using `supabase/schema.sql`
- Share a trip by link (anyone with the link can view/edit — no accounts yet)
- Publish `app/` on GitHub Pages

## v1.5 — embedded connections (see docs/API-RESEARCH.md)
- Flights: flight number + date → embedded live flight map (adsb.fi) + FlightAware link
- Restaurants: OpenTable booking embedded in the itinerary item; Resy as a link
- Map (OpenStreetMap/Google embed), weather (Windy embed), shared Google Calendar embed
- Pay-back buttons open Venmo / PayPal

## v2 — nicer splitting
- Uneven splits (by amount / by shares), multiple currencies
- Mark payments as settled
- Categories and a spending summary

## Later ideas
- Date polls ("which weekend works?"), packing list, sign-in with email link
