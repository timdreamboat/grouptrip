// Destination helpers: where it is (for the weather map) and photo choices
// for the trip cover. All free, keyless, and called straight from the browser.
//  - Location: OpenStreetMap Nominatim (low volume; once per destination)
//  - Photos: Wikipedia's lead image + Openverse (openly licensed photos)

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

export async function locate(destination) {
  const hit = await nominatim({ q: destination });
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

const NOT_A_PHOTO = /\b(map|flag|seal|coat of arms|logo|locator|diagram|chart|emblem|svg)\b/i;

async function wikipediaPhoto(destination) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(destination.trim().replace(/\s+/g, '_'))}?redirect=true`);
    if (!res.ok) return null;
    const d = await res.json();
    const src = d.originalimage?.source;
    if (!src || /\.svg/i.test(src) || NOT_A_PHOTO.test(decodeURIComponent(src))) return null;
    const url = src.replace(/\/\d+px-/, '/1280px-'); // Wikimedia only serves standard widths
    return { url, thumb: src.replace(/\/\d+px-/, '/500px-'), credit: 'Photo via Wikipedia', link: d.content_urls?.desktop?.page };
  } catch { return null; }
}

async function openversePhotos(destination) {
  try {
    const q = new URLSearchParams({
      q: destination, category: 'photograph', aspect_ratio: 'wide', size: 'large',
      license: 'cc0,pdm,by,by-sa', mature: 'false', page_size: '12',
    });
    const res = await fetch(`https://api.openverse.org/v1/images/?${q}`);
    if (!res.ok) return [];
    const { results = [] } = await res.json();
    return results
      .filter((r) => !NOT_A_PHOTO.test(r.title || ''))
      .map((r) => ({
        url: r.url,
        thumb: r.thumbnail || r.url,
        credit: `Photo: ${r.creator || 'unknown'} · ${String(r.license).toUpperCase()}`,
        link: r.foreign_landing_url,
      }));
  } catch { return []; }
}

// Best first: Wikipedia's lead photo (great for cities), then open photos.
export async function coverOptions(destination) {
  if (!destination?.trim()) return [];
  const [wiki, open] = await Promise.all([wikipediaPhoto(destination), openversePhotos(destination)]);
  const seen = new Set();
  return [wiki, ...open].filter((p) => p && !seen.has(p.url) && seen.add(p.url)).slice(0, 9);
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
