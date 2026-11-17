// Destination helpers: where it is (for the weather map) and photo choices
// for the trip cover. All free, keyless, and called straight from the browser.
//  - Location: OpenStreetMap Nominatim (low volume; once per destination)
//  - Photos, best first (owner asked for a better automatic pick, 2026-09-28):
//    1. the place's own photo on Wikidata (P18 — a curated representative
//       photo of that exact place, found via Nominatim's wikidata tag),
//    2. the lead photo of the place's Wikipedia article (from the same tag),
//    3. Openverse extras: Flickr photos of "City Region", artworks filtered.
//    Plain keyword search picked Alcatraz, an 1800s engraving ("Orlando and
//    the Wrestler") and old Austin cars — going by the place avoids that.

// A fetch that gives up after `ms`, so one slow partner never stalls a screen
// (Openverse stopped answering browser requests on 2026-10-26 and the cover
// picker waited on it forever).
function fetchT(url, opts = {}, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// Nominatim asks for at most one request per second — queue them.
let nextSlot = 0;
async function nominatim(params) {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Date.now() + wait + 1100;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const res = await fetchT(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: 'jsonv2', limit: '1', ...params })}`,
    { headers: { 'Accept-Language': 'en' } }, 8000);
  const [hit] = res.ok ? await res.json() : [];
  return hit ?? null;
}

// One lookup per destination serves both the map position and the photos.
const places = new Map();
function place(destination) {
  const key = destination.trim().toLowerCase();
  if (!places.has(key)) {
    places.set(key, nominatim({ q: destination, extratags: '1', addressdetails: '1' }).catch(() => { places.delete(key); return null; }));
  }
  return places.get(key);
}

export async function locate(destination) {
  const hit = await place(destination);
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

const NOT_A_PHOTO = /\b(map|flag|seal|coat of arms|logo|locator|diagram|chart|emblem|svg|engraving|etching|lithograph|painting|drawing|illustration|poster|portrait|manuscript|plate|sketch|woodcut|print|postcard|stamp|coin|banner)\b/i;
const commonsFile = (file, width) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;

// The place's representative photo on Wikidata (P18).
async function wikidataPhoto(qid) {
  if (!/^Q\d+$/.test(qid || '')) return null;
  try {
    const res = await fetchT(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetclaims', entity: qid, property: 'P18', format: 'json', origin: '*' })}`);
    if (!res.ok) return null;
    const file = (await res.json()).claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!file || /\.svg$/i.test(file) || NOT_A_PHOTO.test(file)) return null;
    return { url: commonsFile(file, 1280), thumb: commonsFile(file, 500), credit: 'Photo via Wikimedia Commons',
      link: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}` };
  } catch { return null; }
}

async function wikipediaPhoto(title) {
  try {
    const res = await fetchT(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replace(/\s+/g, '_'))}?redirect=true`);
    if (!res.ok) return null;
    const d = await res.json();
    const src = d.originalimage?.source;
    if (!src || /\.svg/i.test(src) || NOT_A_PHOTO.test(decodeURIComponent(src))) return null;
    const url = src.replace(/\/\d+px-/, '/1280px-'); // Wikimedia only serves standard widths
    return { url, thumb: src.replace(/\/\d+px-/, '/500px-'), credit: 'Photo via Wikipedia', link: d.content_urls?.desktop?.page };
  } catch { return null; }
}

async function openversePhotos(query) {
  try {
    const q = new URLSearchParams({
      q: query, source: 'flickr', aspect_ratio: 'wide',
      license: 'cc0,pdm,by,by-sa', mature: 'false', page_size: '20',
    });
    const res = await fetchT(`https://api.openverse.org/v1/images/?${q}`, {}, 5000);
    if (!res.ok) return [];
    const { results = [] } = await res.json();
    const titles = new Set();
    return results
      // Real photos only, big enough for a cover, not panoramic strips, one per photo series.
      .filter((r) => !NOT_A_PHOTO.test(r.title || '') && (r.width ?? 1024) >= 900 && (r.width ?? 3) / (r.height ?? 2) <= 2.2)
      .filter((r) => { const t = (r.title || '').replace(/\d+/g, '').trim().toLowerCase(); return !titles.has(t) && titles.add(t); })
      .map((r) => ({
        url: r.url,
        thumb: r.thumbnail || r.url,
        credit: `Photo: ${r.creator || 'unknown'} · ${String(r.license).toUpperCase()}`,
        link: r.foreign_landing_url,
      }));
  } catch { return []; }
}

// Wikimedia Commons search: extra photos of the place when Openverse is slow
// or down (it stopped answering browsers on 2026-10-26). Keyless, CORS-friendly.
async function commonsPhotos(query) {
  try {
    const q = new URLSearchParams({
      action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '14',
      gsrsearch: `filetype:bitmap "${query}" skyline OR downtown OR beach OR lake OR park OR street OR view`,
      prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '500', format: 'json', origin: '*',
    });
    const res = await fetchT(`https://commons.wikimedia.org/w/api.php?${q}`);
    if (!res.ok) return [];
    const pages = Object.values((await res.json()).query?.pages ?? {});
    const series = new Set(); // "Lake Eola Park 01/02/05" → one of them
    return pages
      .map((p) => ({ title: p.title.replace(/^File:/, ''), i: p.imageinfo?.[0] }))
      .filter(({ title, i }) => i && !NOT_A_PHOTO.test(title) && (i.width ?? 0) >= 900 && i.width / (i.height || 1) <= 2.2 && i.width / (i.height || 1) >= 0.9)
      .filter(({ title }) => { const t = title.replace(/\.[a-z]+$/i, '').replace(/[\d_-]+/g, ' ').trim().toLowerCase(); return !series.has(t) && series.add(t); })
      .map(({ title, i }) => ({
        url: commonsFile(title, 1280), thumb: i.thumburl || commonsFile(title, 500),
        credit: `Photo: ${(i.extmetadata?.Artist?.value || 'Wikimedia Commons').replace(/<[^>]+>/g, '').trim().slice(0, 40)} · ${i.extmetadata?.LicenseShortName?.value || 'Wikimedia Commons'}`,
        link: i.descriptionurl,
      }));
  } catch { return []; }
}

// Best first — the first one is what gets picked automatically.
// `onFirst(photos)` fires as soon as the place's own photos (Wikidata +
// Wikipedia) are in, so the picker shows something right away; the resolved
// list adds the Openverse extras, if that site answers in time.
export async function coverOptions(destination, onFirst = null) {
  if (!destination?.trim()) return [];
  const hit = await place(destination);
  const tags = hit?.extratags ?? {};
  const article = /^en:/.test(tags.wikipedia || '') ? tags.wikipedia.slice(3) : destination;
  // "Orlando" → "Orlando Florida": the region keeps extra photos on the right place.
  const region = hit?.address?.state || hit?.address?.country || '';
  const name = hit?.name || destination;
  const seen = new Set();
  const key = (p) => decodeURIComponent(p.url).replace(/^.*\//, '').replace(/^\d+px-/, '').replace(/\?.*$/, '').replace(/_/g, ' ').toLowerCase();
  const dedupe = (list) => list.filter((p) => p && !seen.has(key(p)) && seen.add(key(p)));
  const query = region && !name.includes(region) ? `${name} ${region}` : name;
  const extras = Promise.all([openversePhotos(query), commonsPhotos(query)]).then(([a, b]) => [...a, ...b]);
  const own = dedupe(await Promise.all([wikidataPhoto(tags.wikidata), wikipediaPhoto(article)]));
  if (own.length) onFirst?.(own);
  return [...own, ...dedupe(await extras)].slice(0, 9);
}

// Windy's own forecast, embedded: a map plus a day-by-day forecast for the spot.
export function weatherEmbed({ lat, lon }, fahrenheit = true) {
  const p = new URLSearchParams({
    lat: lat.toFixed(3), lon: lon.toFixed(3), detailLat: lat.toFixed(3), detailLon: lon.toFixed(3),
    zoom: '8', level: 'surface', overlay: 'temp', product: 'ecmwf', menu: '', message: 'true', marker: 'true',
    calendar: 'now', type: 'map', location: 'coordinates', detail: 'true',
    metricWind: fahrenheit ? 'mph' : 'km/h', metricTemp: fahrenheit ? '°F' : '°C', radarRange: '-1',
  });
  return `https://embed.windy.com/embed2.html?${p}`;
}

// ---------- distances between places (needs coordinates, i.e. a Google key) ----------
const rad = (d) => (d * Math.PI) / 180;
export function distanceKm(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// Straight-line distance, in miles for US-dollar trips, km otherwise.
export function distanceText(a, b, miles = true) {
  const km = distanceKm(a, b);
  if (km == null) return '';
  const v = miles ? km * 0.621371 : km;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${miles ? 'mi' : 'km'}`;
}
// The middle of everyone's hotels, weighted by how many people are at each.
export function middleOf(stays) {
  const pts = stays.filter((s) => s.lat != null);
  if (pts.length < 2) return null;
  let w = 0, lat = 0, lon = 0;
  for (const s of pts) { const n = Math.max(s.guests?.length || 0, 1); w += n; lat += s.lat * n; lon += s.lon * n; }
  return { lat: lat / w, lon: lon / w };
}
// Google Maps directions from one place to another (opens the app on phones).
export function routeUrl(from, to) {
  const at = (p) => (p.lat != null ? `${p.lat},${p.lon}` : p.q);
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(at(from))}&destination=${encodeURIComponent(at(to))}`;
}

// ---------- places near the trip (plans, hotels, "Find places") ----------
// Photon again (free, keyless OpenStreetMap search). Everything here stays
// around the trip and comes back closest first (owner, 2026-11-17: "if I
// have a trip in Los Angeles I should only see options in Los Angeles,
// closest to furthest").
const AREA_KM = 40; // "in the city": the metro area around the trip

// Where "near" is measured from: the place everyone's staying (if it has a
// pin), else the destination's center — looked up once if the trip has none.
export async function tripCenter(trip) {
  const stay = trip.stays?.find((st) => st.everyone && st.lat != null) ?? trip.stays?.find((st) => st.lat != null);
  if (stay) return { lat: stay.lat, lon: stay.lon, label: stay.name };
  if (trip.lat != null) return { lat: trip.lat, lon: trip.lon, label: trip.destination || 'the trip' };
  const hit = trip.destination ? await locate(trip.destination).catch(() => null) : null;
  return hit ? { ...hit, label: trip.destination } : null;
}

const KIND_NAMES = {
  restaurant: 'Restaurant', fast_food: 'Quick bite', food_court: 'Food court', cafe: 'Café', bakery: 'Bakery', ice_cream: 'Ice cream',
  bar: 'Bar', pub: 'Pub', nightclub: 'Nightclub', biergarten: 'Beer garden', casino: 'Casino',
  theatre: 'Theater', cinema: 'Movie theater', arts_centre: 'Arts center', music_venue: 'Music venue', concert_hall: 'Concert hall',
  events_venue: 'Event venue', stadium: 'Stadium', museum: 'Museum', gallery: 'Gallery', attraction: 'Attraction',
  theme_park: 'Theme park', zoo: 'Zoo', aquarium: 'Aquarium', viewpoint: 'Viewpoint', park: 'Park', nature_reserve: 'Nature reserve',
  beach: 'Beach', golf_course: 'Golf course', amusement_arcade: 'Arcade', bowling_alley: 'Bowling', escape_game: 'Escape room',
  miniature_golf: 'Mini golf', water_park: 'Water park', mall: 'Mall', department_store: 'Department store', marketplace: 'Market',
  hotel: 'Hotel', guest_house: 'Guest house', hostel: 'Hostel', motel: 'Motel', apartment: 'Rental',
};
const kindName = (v) => KIND_NAMES[v] ?? (v && !['yes', 'house', 'residential', 'street'].includes(v) ? v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

// A Photon result → { name, kind, address, detail, lat, lon, km, dist }.
function toPlace({ properties: p, geometry }, from, miles) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = p.name || street;
  if (!name) return null;
  const [lon, lat] = geometry.coordinates;
  const town = p.city || p.town || p.village || p.district || p.county || '';
  const km = from ? distanceKm(from, { lat, lon }) : null;
  const dist = km == null ? '' : km < 0.08 ? 'right here' : distanceText(from, { lat, lon }, miles);
  const where = [p.name && street ? street : null, town, p.state].filter((x) => x && x !== name).join(', ');
  return {
    name, lat, lon, km, dist, kind: kindName(p.osm_value), town, street: p.osm_key === 'highway',
    address: [street || null, town, p.state, p.postcode].filter(Boolean).join(', '),
    detail: [dist, where || p.country].filter(Boolean).join(' · '),
  };
}
// Closest first, one row per place ("The Commerce Casino" = "Commerce Casino").
function tidy(list) {
  const seen = new Set();
  return list.filter(Boolean).sort((a, b) => (a.km ?? 0) - (b.km ?? 0)).filter((p) => {
    const key = `${p.name.toLowerCase().replace(/^the /, '')}|${p.street ? p.town : `${p.lat.toFixed(2)}|${p.lon.toFixed(2)}`}`;
    return !seen.has(key) && seen.add(key);
  });
}
function bbox({ lat, lon }, km) {
  const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((n) => n.toFixed(4)).join(',');
}

// Places of a kind around a point, closest first (Photon's reverse search:
// nearest features with any of the given OpenStreetMap tags, 50 at most).
// `ring` > 0 looks further out: the 50 nearest to four points `ring` steps
// away from the center, still measured (and sorted) from the center.
export async function nearbyPlaces(center, tags, { radiusKm = AREA_KM, miles = true, ring = 0 } = {}) {
  const around = async (pt) => {
    const q = new URLSearchParams({ lat: pt.lat, lon: pt.lon, radius: String(radiusKm), limit: '50', lang: 'en' });
    tags.forEach((t) => q.append('osm_tag', t));
    const res = await fetchT(`https://photon.komoot.io/reverse?${q}`, {}, 9000);
    if (!res.ok) throw new Error("Couldn't load places right now — try again in a moment");
    return (await res.json()).features ?? [];
  };
  const step = 1.6 * ring; // km
  const points = ring === 0 ? [center] : [45, 135, 225, 315].map((deg) => ({
    lat: center.lat + (step / 111) * Math.cos((deg * Math.PI) / 180),
    lon: center.lon + (step / (111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)))) * Math.sin((deg * Math.PI) / 180),
  }));
  const found = (await Promise.all(points.map((pt) => around(pt).catch(() => [])))).flat();
  return tidy(found.filter((f) => f.properties.name).map((f) => toPlace(f, center, miles)));
}
// Two closest-first lists into one, each place once.
export const mergePlaces = (a, b) => tidy([...a, ...b]);

// Places by name around a point, closest first. Only the trip's area; when
// nothing there matches, `wide: true` results from further away (each row
// says how far), so a day trip out of town can still be found.
// `streets: false` leaves out roads (the finder wants places to go; the plan
// form's type-ahead keeps them, for addresses).
export async function searchPlaces(text, center, { tags = [], miles = true, signal, limit = 30, streets = true } = {}) {
  const ask = async (area) => {
    const q = new URLSearchParams({ q: text, limit: '40', lang: 'en' });
    if (center) { q.set('lat', center.lat); q.set('lon', center.lon); q.set('zoom', '11'); q.set('location_bias_scale', '0.5'); }
    if (center && area) q.set('bbox', bbox(center, AREA_KM));
    tags.forEach((t) => q.append('osm_tag', t));
    const res = await fetch(`https://photon.komoot.io/api/?${q}`, { signal });
    if (!res.ok) return [];
    const { features = [] } = await res.json();
    return tidy(features.map((f) => toPlace(f, center, miles))).filter((p) => streets || !p.street);
  };
  if (!center) return { places: (await ask(false)).slice(0, limit), wide: false };
  const local = (await ask(true)).filter((p) => p.km <= AREA_KM * 1.5);
  if (local.length) return { places: local.slice(0, limit), wide: false };
  return { places: (await ask(false)).slice(0, Math.min(limit, 8)), wide: true };
}

// Type-ahead for the place fields in the plan and hotel forms. `near` is a
// point or a function that resolves to one (see tripCenter). `tag` narrows it
// (e.g. 'tourism' for hotels). Each pick carries lat/lon, so plans and hotels
// get a map pin even without a Google key.
export function placeSuggester({ near = null, tag = null, miles = true } = {}) {
  let center;
  return async (q, signal) => {
    if (center === undefined) center = (typeof near === 'function' ? await near() : near) ?? null;
    if (center?.lat == null) center = null;
    const { places } = await searchPlaces(q, center, { tags: tag ? [tag] : [], miles, signal, limit: 6 });
    return places;
  };
}

// ---------- destination type-ahead ----------
// Photon (komoot's free, keyless OpenStreetMap search) is built for search-as-you-type,
// unlike Nominatim. Returns cities, regions, lakes, parks — not streets or shops.
const SKIP = new Set(['street', 'house']);
const KEEP_HOUSE = new Set(['attraction', 'theme_park', 'resort', 'island', 'beach']);
export async function suggestDestinations(q, signal) {
  const res = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: '10', lang: 'en' })}`, { signal });
  if (!res.ok) return [];
  const { features = [] } = await res.json();
  const seen = new Set();
  return features.flatMap(({ properties: p, geometry }) => {
    if (!p.name || (SKIP.has(p.type) && !KEEP_HOUSE.has(p.osm_value))) return [];
    const detail = [p.city !== p.name ? p.city : null, p.state !== p.name ? p.state : null, p.country !== p.name ? p.country : null]
      .filter(Boolean).join(', ');
    const key = `${p.name}|${detail}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const [lon, lat] = geometry.coordinates;
    return [{ name: p.name, detail, lat, lon }];
  }).slice(0, 6);
}
