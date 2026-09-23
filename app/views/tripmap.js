// The Calendar's map: a numbered pin for every plan with a found location,
// in the order they happen. Tapping a pin shows the plan's card.
// Leaflet + OpenStreetMap tiles (free, attribution shown on the map).
import { esc, icon, fmtDay, fmtTime } from '../ui.js';

let leaflet;
function loadLeaflet() {
  leaflet ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = () => resolve(window.L);
    js.onerror = () => { leaflet = null; reject(new Error('Map failed to load')); };
    document.head.append(js);
  });
  return leaflet;
}

// Plans that have a pin, numbered in time order (the itinerary is already sorted).
export const pinned = (trip) => trip.itinerary.filter((i) => i.lat != null && i.lon != null);

export function popupHTML(it, n) {
  return `
    <div class="pin-card">
      <div class="pin-card-head"><span class="pin-num">${n}</span><b>${esc(it.title)}</b></div>
      ${it.place ? `<div class="pin-row">${icon('pin', 'tiny')}${esc(it.place)}</div>` : ''}
      ${it.day || it.time ? `<div class="pin-row">${icon('calendar', 'tiny')}${esc([it.day && fmtDay(it.day), it.time && fmtTime(it.time)].filter(Boolean).join(' · '))}</div>` : ''}
      ${it.notes ? `<div class="pin-notes">${esc(it.notes)}</div>` : ''}
      <a class="pin-link" href="https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lon}" target="_blank" rel="noopener">Directions ${icon('external', 'tiny')}</a>
    </div>`;
}

let current = null; // { map, markers: Map(id → marker) }

export async function mountTripMap(el, trip) {
  current?.map.remove();
  current = null;
  const L = await loadLeaflet().catch(() => null);
  if (!L || !el.isConnected) return null;

  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
  // Standard OpenStreetMap tiles (free, no key; dark mode tints them in CSS).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const markers = new Map();
  const pins = pinned(trip);
  pins.forEach((it, i) => {
    const marker = L.marker([it.lat, it.lon], {
      icon: L.divIcon({ className: 'map-pin', html: `<span class="shape"></span><span class="n">${i + 1}</span>`, iconSize: [32, 40], iconAnchor: [16, 38], popupAnchor: [0, -34] }),
      title: it.title,
    }).addTo(map).bindPopup(popupHTML(it, i + 1), { maxWidth: 260, minWidth: 200, className: 'pin-popup' });
    markers.set(it.id, marker);
  });

  if (pins.length > 1) map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lon])), { padding: [36, 36], maxZoom: 15 });
  else if (pins.length === 1) map.setView([pins[0].lat, pins[0].lon], 14);
  else map.setView([trip.lat, trip.lon], 11);

  // Two-finger/ctrl scroll zooms on desktop; the page still scrolls normally.
  el.addEventListener('wheel', (e) => { if (e.ctrlKey) map.scrollWheelZoom.enable(); else map.scrollWheelZoom.disable(); }, { passive: true });

  current = { map, markers };
  return current;
}

// Pan to a plan's pin and open its card.
export function focusPin(id) {
  const m = current?.markers.get(id);
  if (!m) return false;
  current.map.flyTo(m.getLatLng(), Math.max(current.map.getZoom(), 15), { duration: 0.6 });
  setTimeout(() => m.openPopup(), 650);
  return true;
}
