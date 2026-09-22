// The only file that touches storage. Every function is async and the app
// re-reads the whole trip after each change.
//
// - Shared mode (config.js has a Supabase URL + key): data lives in Supabase
//   and is reached through the share-code functions in supabase/schema.sql.
// - Local mode (config.js empty): data lives in this browser only.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const shared = Boolean(SUPABASE_URL && SUPABASE_KEY);
const newId = () => crypto.randomUUID();

// ---------- tiny localStorage helpers ----------
function readLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

// ---------- shared mode: Supabase RPC over plain fetch ----------
async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `Request failed (${res.status})`);
  return body;
}

// Trips this browser has opened, so the home page can list them.
const RECENT = 'grouptrip.recent';
function remember(trip) {
  const list = readLS(RECENT, []).filter((t) => t.id !== trip.id);
  writeLS(RECENT, [{ id: trip.id, name: trip.name, destination: trip.destination, startDate: trip.startDate }, ...list].slice(0, 30));
}
function forget(id) {
  writeLS(RECENT, readLS(RECENT, []).filter((t) => t.id !== id));
}

const remote = {
  listTrips: async () => readLS(RECENT, []),
  getTrip: async (code) => { const t = await rpc('get_trip', { p_code: code }); remember(t); return t; },
  createTrip: async (f) => rpc('create_trip', {
    p_name: f.name, p_destination: f.destination, p_start: f.startDate || null, p_end: f.endDate || null, p_currency: f.currency,
  }),
  deleteTrip: async (code) => { await rpc('delete_trip', { p_code: code }); forget(code); },
  addMember: (code, name) => rpc('add_member', { p_code: code, p_name: name }),
  removeMember: (code, id) => rpc('remove_member', { p_code: code, p_id: id }),
  addItem: (code, item) => rpc('add_item', { p_code: code, p_item: item }),
  removeItem: (code, id) => rpc('remove_item', { p_code: code, p_id: id }),
  addFlight: (code, flight) => rpc('add_flight', { p_code: code, p_flight: flight }),
  removeFlight: (code, id) => rpc('remove_flight', { p_code: code, p_id: id }),
  addExpense: (code, e) => rpc('add_expense', {
    p_code: code, p_description: e.description, p_amount: e.amount, p_paid_by: e.paidBy, p_splits: e.splits,
  }),
  removeExpense: (code, id) => rpc('remove_expense', { p_code: code, p_id: id }),
  lookupFlight: async (number, date) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/flight-lookup?number=${encodeURIComponent(number)}&date=${date}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || 'Flight lookup is not available right now.');
    return body;
  },
};

// ---------- local mode: this browser only ----------
const KEY = 'grouptrip.v0';
const loadDb = () => readLS(KEY, { trips: [] });

function edit(id, fn) {
  const db = loadDb();
  const trip = db.trips.find((t) => t.id === id);
  if (!trip) throw new Error('Trip not found');
  trip.flights ??= [];
  const result = fn(trip);
  writeLS(KEY, db);
  return result;
}

const local = {
  listTrips: async () => loadDb().trips,
  getTrip: async (id) => {
    const t = loadDb().trips.find((t) => t.id === id);
    if (!t) throw new Error('Trip not found');
    return { flights: [], ...t };
  },
  createTrip: async (f) => {
    const db = loadDb();
    const trip = {
      id: newId(), name: f.name, destination: f.destination, startDate: f.startDate, endDate: f.endDate,
      currency: f.currency || 'USD', members: [], itinerary: [], flights: [], expenses: [],
    };
    db.trips.unshift(trip);
    writeLS(KEY, db);
    return trip.id;
  },
  deleteTrip: async (id) => { const db = loadDb(); db.trips = db.trips.filter((t) => t.id !== id); writeLS(KEY, db); },
  addMember: async (id, name) => edit(id, (t) => { t.members.push({ id: newId(), name }); }),
  removeMember: async (id, memberId) => edit(id, (t) => {
    if (t.expenses.some((e) => e.paidBy === memberId || e.splits.some((s) => s.memberId === memberId))) {
      throw new Error('This person is part of an expense — remove those expenses first.');
    }
    t.members = t.members.filter((m) => m.id !== memberId);
    t.flights = t.flights.filter((f) => f.memberId !== memberId);
  }),
  addItem: async (id, item) => edit(id, (t) => { t.itinerary.push({ id: newId(), ...item }); }),
  removeItem: async (id, itemId) => edit(id, (t) => { t.itinerary = t.itinerary.filter((i) => i.id !== itemId); }),
  addFlight: async (id, flight) => edit(id, (t) => { t.flights.push({ id: newId(), ...flight }); }),
  removeFlight: async (id, flightId) => edit(id, (t) => { t.flights = t.flights.filter((f) => f.id !== flightId); }),
  addExpense: async (id, e) => edit(id, (t) => {
    t.expenses.unshift({ id: newId(), spentOn: new Date().toISOString().slice(0, 10), ...e });
  }),
  removeExpense: async (id, expenseId) => edit(id, (t) => { t.expenses = t.expenses.filter((e) => e.id !== expenseId); }),
  lookupFlight: async () => { throw new Error('Automatic lookup turns on once sharing is set up. Type the times in for now.'); },
};

export const {
  listTrips, getTrip, createTrip, deleteTrip, addMember, removeMember, addItem, removeItem,
  addFlight, removeFlight, addExpense, removeExpense, lookupFlight,
} = shared ? remote : local;
