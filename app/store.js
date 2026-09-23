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
  try { localStorage.removeItem(CACHE_PREFIX + code); } catch { /* ignore */ }
}
// Trips this device is a member of (for turning notifications on for all of them).
export const joinedCodes = () => Object.keys(read(IDS, {}));

// ---------- reading ----------
// Offline: every trip opened is saved on the device; with no connection we
// show that copy (marked _offline) instead of an error.
const CACHE_PREFIX = 'grouptrip.cache.';
export async function getTrip(code) {
  let trip;
  try {
    trip = await rpc('get_trip', { p_code: code, p_token: tokenFor(code) });
  } catch (err) {
    const saved = read(CACHE_PREFIX + code, null);
    if (saved && (!navigator.onLine || err instanceof TypeError)) return { ...saved, _offline: true };
    throw err;
  }
  // A stale token (e.g. removed from the trip) means this device is no longer a member.
  if (!trip.me && tokenFor(code)) dropToken(code);
  remember(trip);
  if (trip.me) write(CACHE_PREFIX + code, trip);
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
export const getMe = (code) => act('get_me', code);
export const savePush = (code, sub) => act('save_push', code, { p_sub: sub });
export const removePush = (code, endpoint) => act('remove_push', code, { p_endpoint: endpoint });

// "Email me my link" — from the You screen (saved email) or when locked out.
async function emailLinkFn(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/email-link`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new Error(out?.error || 'Could not send the email. Please try again.');
  return out;
}
export const sendMyLink = (code) => emailLinkFn({ action: 'send', code, token: tokenFor(code) });
export const recoverLink = (code, email) => emailLinkFn({ action: 'recover', code, email });
export const updateTrip = (code, trip) => act('update_trip', code, { p_trip: trip });
export async function deleteTrip(code) {
  await photosFn({ action: 'purge', code, token: tokenFor(code) }); // remove the album's files first
  await act('delete_trip', code);
  forgetTrip(code);
}
export const inviteMember = (code, name) => act('invite_member', code, { p_name: name });
export const removeMember = (code, id) => act('remove_member', code, { p_id: id });
export const addItem = (code, item) => act('add_item', code, { p_item: item });
export const removeItem = (code, id) => act('remove_item', code, { p_id: id });
export const setItemLocation = (code, id, lat, lon) => act('set_item_location', code, { p_id: id, p_lat: lat, p_lon: lon });
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
export const createPoll = (code, poll) => act('create_poll', code, { p_poll: poll });
export const addPollOption = (code, pollId, option) => act('add_poll_option', code, { p_poll: pollId, p_option: option });
export const setVote = (code, optionId, on) => act('set_vote', code, { p_option: optionId, p_on: on });
export const closePoll = (code, pollId, closed) => act('close_poll', code, { p_poll: pollId, p_closed: closed });
export const removePoll = (code, pollId) => act('remove_poll', code, { p_poll: pollId });

// ---------- photo album ----------
async function photosFn(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/photos`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new Error(out?.error || 'Photo upload is not available right now.');
  return out;
}

export const photoUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/trip-photos/${path}`;

// Shrink on the device before uploading: full size (longest side 2048px) + a
// small thumbnail for the grid. Keeps uploads fast and the free storage roomy.
async function shrink(file, max, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return { blob, w, h };
}

async function put(url, blob) {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  if (!res.ok) throw new Error('Upload failed. Check your connection and try again.');
}

// Uploads files one by one; onProgress(done, total). Returns how many worked.
export async function uploadPhotos(code, files, onProgress) {
  let done = 0, ok = 0, slots = [];
  for (const [i, file] of files.entries()) {
    if (i % 20 === 0) { // upload slots come 20 at a time
      slots = await photosFn({ action: 'sign', code, token: tokenFor(code), count: Math.min(20, files.length - i) });
    }
    const slot = slots[i % 20];
    try {
      const full = await shrink(file, 2048, 0.85);
      const thumb = await shrink(file, 640, 0.78);
      await put(slot.uploadUrl, full.blob);
      await put(slot.thumbUploadUrl, thumb.blob);
      await act('add_photo', code, { p_photo: { path: slot.path, thumbPath: slot.thumbPath, width: full.w, height: full.h } });
      ok++;
    } catch { /* skip files that aren't images or fail to upload */ }
    onProgress?.(++done, files.length);
  }
  return ok;
}

export const removePhoto = (code, id) => photosFn({ action: 'delete', code, token: tokenFor(code), id });

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
