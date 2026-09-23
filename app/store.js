// The only file that talks to the database (Supabase) and keeps
// per-device identity. Every trip change goes through a share-code function
// in supabase/schema.sql; the person's secret token says who is acting.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || 'Something went wrong. Please try again.');
  return body;
}

// ---------- this device: who am I on each trip, which trips have I seen ----------
function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const IDS = 'grouptrip.identities';   // { [code]: token }
const TRIPS = 'grouptrip.trips';      // recent trips for the home screen

export const tokenFor = (code) => read(IDS, {})[code] ?? null;
export function saveToken(code, token) { write(IDS, { ...read(IDS, {}), [code]: token }); }
function dropToken(code) { const ids = read(IDS, {}); delete ids[code]; write(IDS, ids); }

export const listTrips = () => read(TRIPS, []);
function remember(trip) {
  const me = trip.me && trip.members.find((m) => m.id === trip.me.id);
  const summary = {
    id: trip.id, name: trip.name, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate,
    role: trip.me ? (trip.me.isOrganizer ? 'organizer' : 'guest') : 'invited',
    going: trip.members.filter((m) => m.rsvp === 'going').map((m) => ({ name: m.name })),
    cover: trip.cover?.url ?? null,
    myName: me?.name,
  };
  write(TRIPS, [summary, ...listTrips().filter((t) => t.id !== trip.id)].slice(0, 40));
}
export function forgetTrip(code) {
  write(TRIPS, listTrips().filter((t) => t.id !== code));
  dropToken(code);
}

// ---------- reading ----------
export async function getTrip(code) {
  const trip = await rpc('get_trip', { p_code: code, p_token: tokenFor(code) });
  // A stale token (e.g. removed from the trip) means this device is no longer a member.
  if (!trip.me && tokenFor(code)) dropToken(code);
  remember(trip);
  return trip;
}

// ---------- joining ----------
export async function createTrip(f) {
  const r = await rpc('create_trip', {
    p_name: f.name, p_destination: f.destination, p_start: f.startDate || null, p_end: f.endDate || null,
    p_currency: f.currency || 'USD', p_organizer: f.organizer,
  });
  saveToken(r.code, r.token);
  return r.code;
}
export async function joinTrip(code, name) {
  const r = await rpc('join_trip', { p_code: code, p_name: name });
  saveToken(code, r.token);
}
export async function claimMember(code, memberId) {
  const r = await rpc('claim_member', { p_code: code, p_member: memberId });
  saveToken(code, r.token);
}

// ---------- acting (all need this device's token) ----------
const act = (fn, code, args = {}) => rpc(fn, { p_code: code, p_token: tokenFor(code), ...args });

export const updateMe = (code, me) => act('update_me', code, { p_me: me });
export const updateTrip = (code, trip) => act('update_trip', code, { p_trip: trip });
export async function deleteTrip(code) { await act('delete_trip', code); forgetTrip(code); }
export const inviteMember = (code, name) => act('invite_member', code, { p_name: name });
export const removeMember = (code, id) => act('remove_member', code, { p_id: id });
export const addItem = (code, item) => act('add_item', code, { p_item: item });
export const removeItem = (code, id) => act('remove_item', code, { p_id: id });
export const addFlight = (code, flight) => act('add_flight', code, { p_flight: flight });
export const removeFlight = (code, id) => act('remove_flight', code, { p_id: id });
export const addExpense = (code, e) => act('add_expense', code, {
  p_description: e.description, p_amount: e.amount, p_paid_by: e.paidBy, p_splits: e.splits,
});
export const removeExpense = (code, id) => act('remove_expense', code, { p_id: id });
export const addStay = (code, stay) => act('add_stay', code, { p_stay: stay });
export const removeStay = (code, id) => act('remove_stay', code, { p_id: id });
export const addListItem = (code, text, personal) => act('add_list_item', code, { p_text: text, p_personal: personal });
export const updateListItem = (code, id, change) => act('update_list_item', code, { p_id: id, p_change: change });
export const removeListItem = (code, id) => act('remove_list_item', code, { p_id: id });

export async function lookupFlight(number, date) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/flight-lookup?number=${encodeURIComponent(number)}&date=${date}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Flight lookup is not available right now.');
  return body;
}

// ---------- links ----------
const base = () => location.origin + location.pathname;
export const inviteLink = (code) => `${base()}#/t/${code}`;
// Opens the trip as this person on another device. Private — it signs in as them.
export const personalLink = (code) => `${base()}#/me/${code}/${tokenFor(code)}`;

// Subscribable calendar feed (Apple/Google/Outlook keep it in sync).
export const calendarFeed = (code) => `${SUPABASE_URL}/functions/v1/calendar?trip=${code}`;
