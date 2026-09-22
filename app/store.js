// The only file that touches storage. v0 = this browser's localStorage.
// v1 will replace these functions with Supabase calls (see supabase/schema.sql).

const KEY = 'grouptrip.v0';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? { trips: [] }; }
  catch { return { trips: [] }; }
}

function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ }
}

export const newId = () => crypto.randomUUID();

export function listTrips() {
  return load().trips;
}

export function getTrip(id) {
  return load().trips.find((t) => t.id === id) ?? null;
}

export function saveTrip(trip) {
  const db = load();
  const i = db.trips.findIndex((t) => t.id === trip.id);
  if (i >= 0) db.trips[i] = trip; else db.trips.unshift(trip);
  save(db);
  return trip;
}

export function deleteTrip(id) {
  const db = load();
  db.trips = db.trips.filter((t) => t.id !== id);
  save(db);
}

export function createTrip({ name, destination, startDate, endDate, currency }) {
  return saveTrip({
    id: newId(), name, destination, startDate, endDate,
    currency: currency || 'USD',
    members: [], itinerary: [], expenses: [],
    createdAt: new Date().toISOString(),
  });
}
