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

// Nominatim asks for at most one request per second — queue them.
let nextSlot = 0;
async function nominatim(params) {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Date.now() + wait + 1100;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: 'jsonv2', limit: '1', ...params })}`,
    { headers: { 'Accept-Language': 'en' } });
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
    const res = await fetch(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetclaims', entity: qid, property: 'P18', format: 'json', origin: '*' })}`);
    if (!res.ok) return null;
    const file = (await res.json()).claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!file || /\.svg$/i.test(file) || NOT_A_PHOTO.test(file)) return null;
    return { url: commonsFile(file, 1280), thumb: commonsFile(file, 500), credit: 'Photo via Wikimedia Commons',
      link: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}` };
  } catch { return null; }
}

async function wikipediaPhoto(title) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replace(/\s+/g, '_'))}?redirect=true`);
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
    const res = await fetch(`https://api.openverse.org/v1/images/?${q}`);
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

// Best first — the first one is what gets picked automatically.
export async function coverOptions(destination) {
  if (!destination?.trim()) return [];
  const hit = await place(destination);
  const tags = hit?.extratags ?? {};
  const article = /^en:/.test(tags.wikipedia || '') ? tags.wikipedia.slice(3) : destination;
  // "Orlando" → "Orlando Florida": the region keeps extra photos on the right place.
  const region = hit?.address?.state || hit?.address?.country || '';
  const name = hit?.name || destination;
  const [data, wiki, open] = await Promise.all([
    wikidataPhoto(tags.wikidata),
    wikipediaPhoto(article),
    openversePhotos(region && !name.includes(region) ? `${name} ${region}` : name),
  ]);
  const seen = new Set();
  const key = (p) => decodeURIComponent(p.url).replace(/^.*\//, '').replace(/^\d+px-/, '').replace(/\?.*$/, '').replace(/_/g, ' ').toLowerCase();
  return [data, wiki, ...open].filter((p) => p && !seen.has(key(p)) && seen.add(key(p))).slice(0, 9);
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

// ---------- place type-ahead (plans, hotels) ----------
// Same Photon search, but for restaurants, shops, attractions, streets and
// addresses, nearest `near` (the trip's destination) first. `tag` narrows it
// (e.g. 'tourism' for hotels). Each pick carries lat/lon, so plans and hotels
// get a map pin even without a Google key.
export function placeSuggester({ near = null, tag = null } = {}) {
  return async (q, signal) => {
    const params = new URLSearchParams({ q, limit: '12', lang: 'en' });
    if (near?.lat != null && near?.lon != null) {
      params.set('lat', near.lat); params.set('lon', near.lon);
      params.set('zoom', '11'); params.set('location_bias_scale', '0.5');
    }
    if (tag) params.set('osm_tag', tag);
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
    if (!res.ok) return [];
    const { features = [] } = await res.json();
    const seen = new Set();
    return features.flatMap(({ properties: p, geometry }) => {
      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      const name = p.name || street;
      if (!name) return [];
      const town = p.city || p.town || p.village || p.county || '';
      const detail = [p.name && street ? street : null, town, p.state, p.country].filter((x) => x && x !== name).join(', ');
      const key = `${name}|${detail}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const [lon, lat] = geometry.coordinates;
      return [{ name, detail, lat, lon, address: [street || null, town, p.state, p.postcode].filter(Boolean).join(', ') }];
    }).slice(0, 6);
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
