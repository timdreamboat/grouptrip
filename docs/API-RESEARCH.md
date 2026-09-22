# Connections research — September 2026

## The rule (set by the owner, 2026-09-22)
**Every connection shows the partner's own site or official widget, embedded in
GroupTrip.** GroupTrip does not re-create partner features or process their data.
It only holds the trip's shared details: who's coming, which flight, which
restaurant, and so on. It then shows each partner's live embed in one place for the
whole group. When a partner won't allow embedding, we show a button that opens its
site in a new tab.

## What actually embeds (tested in a browser, 2026-09-22)
Sites decide for themselves whether other apps may show them. We loaded each one
inside GroupTrip-style frames to check.

| Service | Embeds? | How | What GroupTrip stores |
|---|---|---|---|
| **OpenTable** | ✅ Yes, official | Restaurant booking page (`opentable.com/restref/client/?rid=…`) or the official "Make a Reservation" widget. The full booking flow runs inside our page. | Restaurant's OpenTable ID (`rid`) |
| **Flight tracking (adsb.fi)** | ✅ Yes | Live flight map: `globe.adsb.fi/?callsign=UAL1`. Community-run and free. | Flight number + date |
| **Flight tracking (ADS-B Exchange)** | ✅ Yes | Same kind of map, but with ads and a "Join" prompt. adsb.fi is cleaner. | — |
| **Map** (OpenStreetMap) | ✅ Yes | `openstreetmap.org/export/embed.html` | Location |
| **Map** (Google Maps) | ✅ Yes | `maps.google.com/maps?q=…&output=embed` (no key needed) or the official Maps Embed API (free, unlimited) | Place name / address |
| **Weather** (Windy) | ✅ Yes, official | `embed.windy.com/embed2.html?lat=…&lon=…` | Destination location |
| **Calendar** (Google Calendar) | ✅ Yes, official | `calendar.google.com/calendar/embed?src=…` for a shared trip calendar | Calendar ID |
| TripIt | ✅ Loads | Its marketing page loads, but a person's own trips need them signed in, and the browser may block that. | — |
| Booking.com, Yelp | ⚠️ Works today | Both send a "planning to block" warning (report-only rules), so embeds could stop working at any time. Treat them as open-in-new-tab. | Link |
| Resy (now includes Tock) | ❌ Blocked | Its widget needs a key tied to each restaurant. Use a button that opens the page. | Link |
| FlightAware, Flightradar24, FlightStats, Plane Finder | ❌ Blocked | Button that opens the page | — |
| Viator, Tripadvisor, Airbnb | ❌ Blocked | Button (Viator's official affiliate widgets would need an affiliate account) | Link |
| Venmo, PayPal, Splitwise | ❌ Blocked | Button. Payment apps should open in their own app or tab anyway, for security. | Username |
| Kayak flight tracker | ❓ Partly | Only the header loaded, so it's not reliable. | — |

## Flights
Each person adds their **flight number + date**. GroupTrip shows:
- a live embedded map of that flight (adsb.fi), and
- buttons that open FlightAware or the airline's page for full status.

Live maps only show a plane while it's in the air. Scheduled departure and arrival
times aren't in any embed, so there are two ways to get them:
1. **The person types them in** when adding the flight. Nothing is processed and it costs nothing.
2. **An automatic lookup** from AeroDataBox (free for a few hundred lookups a month) through a Supabase server
   function. This is a data lookup, not an embed, so it needs the owner's OK under the rule.

Flight numbers need a small conversion for the live map. The airline code on a
ticket (UA) becomes the code the map uses (UAL), for example "UA 1" → `UAL1`.

## Restaurants
- **OpenTable: fully embeddable.** An itinerary item stores the restaurant's
  OpenTable ID, and the group sees and uses OpenTable's own booking screen
  inside GroupTrip. No partner approval or API key is needed.
- **Resy/Tock and others:** a "Reserve on Resy" button that opens their page.

## Not using (and why)
- **Amadeus.** Its self-service APIs shut down July 17, 2026.
- **OpenTable/Resy partner APIs.** They're invite-only, and we don't need them now that OpenTable's embed works.
- **Duffel (booking flights inside the app).** It's a different business, with payments and customer support.
- **Google Places, Foursquare.** They return raw data for us to process, which the rule excludes. Use
  the embedded map search instead.

## Sources
- OpenTable API partners — https://www.opentable.com/restaurant-solutions/api-partners/
- Amadeus self-service shutdown — https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers
- AeroDataBox pricing — https://aerodatabox.com/pricing
- FlightAware AeroAPI pricing — https://www.flightaware.com/commercial/aeroapi/v3/pricing.rvt
- Resy/Tock merger — https://www.americanexpress.com/en-us/newsroom/articles/travel-and-dining/resy-announces-next-phase-of-its-reservation-and-dining-platform.html
- Windy embed — https://embed.windy.com
- Google Maps Embed API — https://developers.google.com/maps/documentation/embed/get-started
- Embed results above: direct browser test, 2026-09-22
