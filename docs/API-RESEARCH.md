# API research — September 2026

Which outside services GroupTrip can plug into, what they cost, and what we
recommend. Prices and terms change often, so check them again right before building.

## One rule for all of these
GroupTrip is a static website, so **anything that needs a secret API key must go
through a small server function**. Anyone can read a static site's code, so a key
kept there is exposed. We'll use Supabase Edge Functions (free tier) as that
middle layer. Keyless APIs such as weather and exchange rates can be called
straight from the browser.

---

## 1. Flights — "add my flight, see when everyone lands"

**What it does for users:** each person enters their flight number and date. GroupTrip fills in the
departure and arrival airports and times. The trip then shows an arrivals board
(who lands where, and when), which helps with airport pickups and sharing rides.

| Option | Free tier | Paid | Notes |
|---|---|---|---|
| **AeroDataBox** ⭐ | 600 "units"/mo (a flight lookup costs about 1–2 units, so a few hundred lookups) | from ~$5/mo | Looks up a flight by number and date. Sold through API.market or RapidAPI. The cheapest option that holds up. |
| FlightAware AeroAPI | Starter: 500 queries/mo, 5/min | $25/mo for 2,500 | The best data and can send live delay alerts. Upgrade to it once we want push updates. |
| Aviationstack | 100 requests/mo | from $49.99/mo | The free tier is too small. |
| ~~Amadeus Self-Service~~ | — | — | **Shut down July 17, 2026.** Many tutorials still point to it, so ignore them. |

**Recommendation:** use AeroDataBox through a Supabase Edge Function. Save the result
when the flight is added, so we look each flight up once instead of on every page view.
Add a "refresh" button for trip day.

**Later option:** import flights from a forwarded confirmation email with the
AwardWallet Email Parsing API. It reads booking emails from any airline, but pricing
is by quote, so hold off until people actually ask for it.

---

## 2. Restaurant reservations — OpenTable

**The short version: OpenTable has no API that a new app can sign up for.** Its
APIs are only for approved partners under a contract. The partners are mainly
restaurant software companies (POS and CRM systems) and established consumer booking apps.
They review your use case first, and a brand-new app with no users is unlikely to
get in.

Resy, which absorbed Tock in August 2026, is also partner-only. It has
announced new third-party APIs for 2026, but has not released anything anyone can
sign up for. SevenRooms is the same.

**Recommendation: use booking links now, and apply to become a partner later.**
- An itinerary item can hold a restaurant plus its booking link (OpenTable, Resy,
  or the restaurant's own site). A **Reserve** button opens that page with the
  party size filled in where the site allows it.
- Whoever books marks the item as reserved and pastes in the confirmation, so the
  whole group can see it.
- This works for every reservation system and needs no approval.
- Once GroupTrip has real users, apply at OpenTable's partner program
  (opentable.com/restaurant-solutions/api-partners).
- ⚠️ Avoid third-party services that sell scraped OpenTable data. They can break
  without warning and may violate OpenTable's terms.

---

## 3. Other APIs worth using

| Need | Recommended | Cost | Why |
|---|---|---|---|
| **Search for restaurants and places** when adding itinerary items | Google Places API (New): Autocomplete + Place Details (Essentials) | 10,000 free calls/mo per feature | The best search results. Save only the place ID, the same rule ALRG follows. Foursquare cut its free tier to 500 calls/mo in June 2026. |
| **Map** of the itinerary | Leaflet + OpenStreetMap | Free | The same setup as ALRG. |
| **Weather** for the trip dates | Open-Meteo | Free, no key | Free for non-commercial use. If GroupTrip adds ads or subscriptions, we'd need its paid plan. |
| **Exchange rates** (for multi-currency trips) | Frankfurter | Free, no key, commercial use OK | Rates from central banks. It fits the v2 multi-currency feature. |
| **Paying each other back** | Venmo and PayPal.me links | Free, no API | A "Pay Tim $42.10 on Venmo" button that opens Venmo with the amount and note filled in. |
| **Tours and activities** | Viator Partner API (Basic affiliate) | Free key, self-serve | Search tours for the destination. Booking happens on Viator's site, and we'd earn about 8% commission. |
| **Add to calendar** | Download an .ics calendar file | Free, no API | Puts flights and itinerary into Google, Apple, or Outlook calendars. |

**Not recommended for now**
- **Booking flights or hotels inside the app** (Duffel: $3 per booking + 1%). It
  means handling payments and customer support. It's a different kind of business.
- **Airbnb.** It has no public API. Use booking links instead.
- **Splitwise sync.** GroupTrip already does the splitting itself.

---

## Suggested order
1. Supabase + share-by-link (v1). This comes first because every other feature needs somewhere to keep keys and shared data.
2. Flights with AeroDataBox, plus the arrivals board.
3. Place search (Google Places) + map + restaurant booking links.
4. Venmo/PayPal buttons on Settle up.
5. Weather, exchange rates, calendar export, Viator activities.

## Sources
- FlightAware AeroAPI pricing — https://www.flightaware.com/commercial/aeroapi/v3/pricing.rvt
- AeroDataBox pricing — https://aerodatabox.com/pricing · https://api.market/store/aedbx/aerodatabox
- Aviationstack pricing — https://aviationstack.com/pricing
- Amadeus self-service shutdown — https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers
- AwardWallet email parsing — https://awardwallet.com/email-parsing-api
- OpenTable API partners — https://www.opentable.com/restaurant-solutions/api-partners/ · https://stayapi.com/blog/opentable-partner-api
- Restaurant booking API landscape — https://hyperleap.ai/blog/restaurant-booking-apis-ai-agents
- Resy/Tock merger and planned APIs — https://www.americanexpress.com/en-us/newsroom/articles/travel-and-dining/resy-announces-next-phase-of-its-reservation-and-dining-platform.html · https://www.usecarly.com/blog/claude-resy-integration/
- Google Places pricing — https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Foursquare pricing change — https://docs.foursquare.com/developer/reference/upcoming-changes
- Open-Meteo terms — https://open-meteo.com/en/terms
- Frankfurter — https://frankfurter.dev/
- Viator access levels — https://partnerresources.viator.com/travel-commerce/levels-of-access/
- Venmo deep links — https://blog.alexbeals.com/posts/venmo-deeplinking
- Duffel pricing — https://duffel.com/
