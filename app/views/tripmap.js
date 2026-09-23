// The Calendar's Google map.
// - With a Google Maps key (config.js): every plan with a found place gets a
//   numbered pin, in the order they happen; tapping one opens the plan's card.
// - Without a key: Google's free embedded map shows one plan's place at a
//   time; the numbered chips under it switch plans and show the plan's card.
import { esc, icon, fmtDay, fmtTime } from '../ui.js';
import { GOOGLE_MAPS_KEY, GOOGLE_MAP_ID } from '../config.js';

export const hasGoogleKey = Boolean(GOOGLE_MAPS_KEY);

// What Google should search for: the place, near the destination.
export const placeQuery = (it, trip) =>
  trip.destination && !it.place.toLowerCase().includes(trip.destination.toLowerCase())
    ? `${it.place}, ${trip.destination}` : it.place;

// Plans on the map, numbered in time order (the itinerary is already sorted).
export const pinned = (trip) =>
  trip.itinerary.filter((i) => (hasGoogleKey ? i.lat != null && i.lon != null : Boolean(i.place)));

const embedUrl = (q, zoom = 15) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`;
const directions = (it, trip) => it.lat != null
  ? `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lon}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(placeQuery(it, trip))}`;

export function cardHTML(it, n, trip) {
  return `
    <div class="pin-card">
      <div class="pin-card-head"><span class="pin-num">${n}</span><b>${esc(it.title)}</b></div>
      ${it.place ? `<div class="pin-row">${icon('pin', 'tiny')}${esc(it.place)}</div>` : ''}
      ${it.day || it.time ? `<div class="pin-row">${icon('calendar', 'tiny')}${esc([it.day && fmtDay(it.day), it.time && fmtTime(it.time)].filter(Boolean).join(' · '))}</div>` : ''}
      ${it.notes ? `<div class="pin-notes">${esc(it.notes)}</div>` : ''}
      <a class="pin-link" href="${esc(directions(it, trip))}" target="_blank" rel="noopener">Directions ${icon('external', 'tiny')}</a>
    </div>`;
}

// ---------- Google Maps JavaScript API (with a key) ----------
let loader;
function loadGoogle() {
  loader ??= new Promise((resolve, reject) => {
    window.__gtMapsReady = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&v=weekly&loading=async&libraries=marker,places&callback=__gtMapsReady`;
    s.async = true;
    s.onerror = () => { loader = null; reject(new Error('Google Maps failed to load')); };
    document.head.append(s);
  });
  return loader;
}

// Google Places text search, biased to ~30 miles around the trip.
export async function googleFindPlace(query, trip) {
  const maps = await loadGoogle();
  const { Place } = await maps.importLibrary('places');
  const req = { textQuery: query, fields: ['displayName', 'formattedAddress', 'location'], maxResultCount: 1 };
  if (trip?.lat != null) req.locationBias = { center: { lat: trip.lat, lng: trip.lon }, radius: 50000 };
  const { places } = await Place.searchByText(req);
  const p = places?.[0];
  return p ? { lat: p.location.lat(), lon: p.location.lng(), label: `${p.displayName}, ${p.formattedAddress}` } : null;
}

// ---------- mounting ----------
let current = null; // { focus(id) }

export async function mountTripMap(el, detailEl, trip) {
  current = null;
  const pins = pinned(trip);
  current = hasGoogleKey ? await mountGoogle(el, trip, pins).catch(() => null) : null;
  current ??= mountEmbed(el, detailEl, trip, pins);
  return current;
}

async function mountGoogle(el, trip, pins) {
  const maps = await loadGoogle();
  const { AdvancedMarkerElement } = await maps.importLibrary('marker');
  if (!el.isConnected) return null;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const map = new maps.Map(el, {
    mapId: GOOGLE_MAP_ID, center: { lat: trip.lat ?? pins[0]?.lat ?? 0, lng: trip.lon ?? pins[0]?.lon ?? 0 }, zoom: 11,
    disableDefaultUI: true, zoomControl: true, fullscreenControl: true, gestureHandling: 'cooperative',
    colorScheme: dark ? 'DARK' : 'LIGHT',
  });
  const info = new maps.InfoWindow();
  const markers = new Map();
  pins.forEach((it, i) => {
    const pin = document.createElement('div');
    pin.className = 'map-pin';
    pin.innerHTML = `<span class="shape"></span><span class="n">${i + 1}</span>`;
    const marker = new AdvancedMarkerElement({ map, position: { lat: it.lat, lng: it.lon }, content: pin, title: it.title });
    marker.addListener('click', () => { info.setContent(cardHTML(it, i + 1, trip)); info.open({ anchor: marker, map }); });
    markers.set(it.id, marker);
  });
  if (pins.length > 1) {
    const b = new maps.LatLngBounds();
    pins.forEach((p) => b.extend({ lat: p.lat, lng: p.lon }));
    map.fitBounds(b, 48);
  } else if (pins.length === 1) { map.setCenter({ lat: pins[0].lat, lng: pins[0].lon }); map.setZoom(14); }

  return {
    focus(id) {
      const m = markers.get(id);
      if (!m) return false;
      map.panTo(m.position);
      if (map.getZoom() < 14) map.setZoom(15);
      maps.event.trigger(m, 'click');
      return true;
    },
  };
}

// Keyless: Google's embedded map, one place at a time.
function mountEmbed(el, detailEl, trip, pins) {
  const show = (it) => {
    const n = pins.indexOf(it) + 1;
    // Google's keyless map centers on the place but draws no marker, so we
    // draw the plan's numbered pin at the center — and hide it once they
    // start moving the map (it would no longer point at the place).
    el.innerHTML = `<iframe class="gmap-embed" title="Map" referrerpolicy="no-referrer-when-downgrade"
      src="${esc(it ? embedUrl(placeQuery(it, trip)) : embedUrl(trip.destination, 11))}"></iframe>
      ${it ? `<div class="map-pin center-pin" aria-hidden="true"><span class="shape"></span><span class="n">${n}</span></div>` : ''}`;
    if (!detailEl) return;
    detailEl.innerHTML = pins.length ? `
      <div class="pin-chips">${pins.map((p, i) => `<button class="pin-chip ${p === it ? 'on' : ''}" data-pin="${p.id}" title="${esc(p.title)}">${i + 1}</button>`).join('')}</div>
      ${it ? `<div class="pin-detail">${cardHTML(it, n, trip)}</div>` : ''}` : '';
  };
  // Start on the next plan that hasn't happened yet.
  const today = new Date().toISOString().slice(0, 10);
  show(pins.find((p) => !p.day || p.day >= today) ?? pins[0] ?? null);
  // Focus moving into the map means they're panning/zooming it.
  const onBlur = () => {
    if (!el.isConnected) return window.removeEventListener('blur', onBlur);
    if (document.activeElement === el.querySelector('iframe')) el.querySelector('.center-pin')?.classList.add('gone');
  };
  window.addEventListener('blur', onBlur);
  detailEl?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pin]');
    if (b) show(pins.find((p) => p.id === b.dataset.pin));
  });
  return { focus(id) { const it = pins.find((p) => p.id === id); if (!it) return false; show(it); return true; } };
}

export const focusPin = (id) => current?.focus(id) ?? false;
