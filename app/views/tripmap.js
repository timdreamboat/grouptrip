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

// Where we're staying, on the map too (bed pin instead of a number).
export const stayQuery = (st, trip) => [st.name, st.address].filter(Boolean).join(', ') || trip.destination;
export const staysOnMap = (trip) =>
  trip.stays.filter((st) => (hasGoogleKey ? st.lat != null && st.lon != null : Boolean(st.address || st.name)));

export function stayCardHTML(st, trip) {
  const when = (d, t) => [d && fmtDay(d), t && fmtTime(t)].filter(Boolean).join(' · ');
  const dest = st.lat != null ? `${st.lat},${st.lon}` : encodeURIComponent(stayQuery(st, trip));
  return `
    <div class="pin-card">
      <div class="pin-card-head"><span class="pin-num stay">${icon('bed', 'tiny')}</span><b>${esc(st.name)}</b></div>
      ${st.address ? `<div class="pin-row">${icon('pin', 'tiny')}${esc(st.address)}</div>` : ''}
      ${st.checkIn ? `<div class="pin-row">${icon('calendar', 'tiny')}In ${esc(when(st.checkIn, st.checkInTime))}${st.checkOut ? ` · Out ${esc(when(st.checkOut, st.checkOutTime))}` : ''}</div>` : ''}
      ${st.confirmation ? `<div class="pin-notes">Confirmation: ${esc(st.confirmation)}</div>` : ''}
      <a class="pin-link" href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noopener">Directions ${icon('external', 'tiny')}</a>
    </div>`;
}

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
  const stays = staysOnMap(trip);
  current = hasGoogleKey ? await mountGoogle(el, trip, pins, stays).catch(() => null) : null;
  current ??= mountEmbed(el, detailEl, trip, pins, stays);
  return current;
}

async function mountGoogle(el, trip, pins, stays) {
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
  stays.forEach((st) => {
    const pin = document.createElement('div');
    pin.className = 'map-pin stay';
    pin.innerHTML = `<span class="shape"></span><span class="n">${icon('bed', 'tiny')}</span>`;
    const marker = new AdvancedMarkerElement({ map, position: { lat: st.lat, lng: st.lon }, content: pin, title: st.name, zIndex: 10 });
    marker.addListener('click', () => { info.setContent(stayCardHTML(st, trip)); info.open({ anchor: marker, map }); });
    markers.set(st.id, marker);
  });
  const all = [...pins, ...stays];
  if (all.length > 1) {
    const b = new maps.LatLngBounds();
    all.forEach((p) => b.extend({ lat: p.lat, lng: p.lon }));
    map.fitBounds(b, 48);
  } else if (all.length === 1) { map.setCenter({ lat: all[0].lat, lng: all[0].lon }); map.setZoom(14); }

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

// Keyless: Google's embedded map, one place at a time. Buttons under it
// switch between the hotel (bed) and the plans (numbers).
function mountEmbed(el, detailEl, trip, pins, stays) {
  const spots = [
    ...stays.map((st) => ({ id: st.id, stay: true, label: icon('bed', 'tiny'), title: st.name, q: stayQuery(st, trip), card: () => stayCardHTML(st, trip) })),
    ...pins.map((it, i) => ({ id: it.id, label: String(i + 1), title: it.title, q: placeQuery(it, trip), card: () => cardHTML(it, i + 1, trip) })),
  ];
  const show = (spot) => {
    // Google's keyless map centers on the place but draws no marker, so we
    // draw ours at the center — and hide it once they start moving the map.
    el.innerHTML = `<iframe class="gmap-embed" title="Map" referrerpolicy="no-referrer-when-downgrade"
      src="${esc(spot ? embedUrl(spot.q) : embedUrl(trip.destination, 11))}"></iframe>
      ${spot ? `<div class="map-pin center-pin ${spot.stay ? 'stay' : ''}" aria-hidden="true"><span class="shape"></span><span class="n">${spot.label}</span></div>` : ''}`;
    if (!detailEl) return;
    detailEl.innerHTML = spots.length ? `
      <div class="pin-chips">${spots.map((p) => `<button class="pin-chip ${p.stay ? 'stay' : ''} ${p === spot ? 'on' : ''}" data-pin="${p.id}" title="${esc(p.title)}" aria-label="${esc(p.title)}">${p.label}</button>`).join('')}</div>
      ${spot ? `<div class="pin-detail">${spot.card()}</div>` : ''}` : '';
  };
  // Start on the next plan that hasn't happened yet, else the hotel.
  const today = new Date().toISOString().slice(0, 10);
  const next = pins.find((p) => !p.day || p.day >= today);
  show(spots.find((sp) => sp.id === next?.id) ?? spots[0] ?? null);
  // Focus moving into the map means they're panning/zooming it.
  const onBlur = () => {
    if (!el.isConnected) return window.removeEventListener('blur', onBlur);
    if (document.activeElement === el.querySelector('iframe')) el.querySelector('.center-pin')?.classList.add('gone');
  };
  window.addEventListener('blur', onBlur);
  detailEl?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pin]');
    if (b) show(spots.find((p) => p.id === b.dataset.pin));
  });
  return { focus(id) { const sp = spots.find((p) => p.id === id); if (!sp) return false; show(sp); return true; } };
}

export const focusPin = (id) => current?.focus(id) ?? false;
