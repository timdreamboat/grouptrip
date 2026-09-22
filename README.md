# GroupTrip

Plan a trip with friends and split the costs, all in one place.

- **People**: who's on the trip
- **Flights**: everyone's flight, sorted by who lands first, with a live flight map
- **Itinerary**: plans by day, with maps and OpenTable booking built in
- **Expenses**: who paid, and who it was for
- **Settle up**: the fewest payments to square everyone up, with Venmo buttons

Partner sites (OpenTable, maps, flight tracking) show up inside GroupTrip as
their own pages. GroupTrip doesn't copy their data. See `docs/API-RESEARCH.md`.

## Live app
https://timdreamboat.github.io/grouptrip/ (published from `app/` on every push to main)

## Try it locally
Run `python3 -m http.server 8080 -d app` and open http://localhost:8080.

## Turning on sharing (Supabase)
1. Create a free Supabase project named `grouptrip`.
2. Run `supabase/schema.sql` in it (Claude does this for you).
3. Put the project URL and publishable key in `app/config.js`.
4. Optional, for automatic flight times: deploy `supabase/functions/flight-lookup`
   and set the `AERODATABOX_KEY` secret (a RapidAPI key subscribed to AeroDataBox).
