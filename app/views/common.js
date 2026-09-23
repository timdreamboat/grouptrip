// Pieces shared by several trip screens.
import { esc, icon, coverBg, avatarStack, fmtRange, countdown, daysUntil } from '../ui.js';
import { balances } from '../money.js';

export const going = (trip) => trip.members.filter((m) => m.rsvp === 'going');
export const memberById = (trip, id) => trip.members.find((m) => m.id === id);
export const nameOf = (trip, id) => memberById(trip, id)?.name ?? 'Someone';
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0];
export const flightsOf = (trip, memberId) => trip.flights.filter((f) => f.memberId === memberId);
export const organizer = (trip) => trip.members.find((m) => m.isOrganizer);

export function myBalance(trip) {
  return trip.me ? (balances(trip)[trip.me.id] ?? 0) : 0;
}

// The next plan that hasn't happened yet (or the first one before the trip).
export function nextUp(trip) {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dated = trip.itinerary.filter((i) => i.day);
  return dated.find((i) => i.day >= todayIso) ?? null;
}

export function heroHTML(trip, { top = '', size = 'lg' } = {}) {
  const cd = countdown(trip);
  const people = going(trip);
  return `
  <section class="hero" style="background:${esc(coverBg(trip.destination || trip.name, trip.cover?.url))}">
    ${trip.cover?.credit ? `<a class="hero-credit" href="${esc(trip.cover.link || '#')}" target="_blank" rel="noopener">${esc(trip.cover.credit)}</a>` : ''}
    <div class="hero-top">${top}</div>
    <div>
      <h1 class="display" style="${size === 'sm' ? 'font-size:clamp(40px,9vw,56px)' : ''}">${esc(trip.name)}</h1>
      <div class="hero-meta">
        ${trip.destination ? `<span class="chip glass">${icon('pin')}${esc(trip.destination)}</span>` : ''}
        <span class="chip glass">${icon('calendar')}${esc(fmtRange(trip.startDate, trip.endDate))}</span>
        ${cd ? `<span class="chip glass">${icon('clock')}${esc(cd)}</span>` : ''}
        ${people.length ? `<span style="margin-left:4px">${avatarStack(people, 5, 28)}</span>` : ''}
      </div>
    </div>
  </section>`;
}

export const rsvpLabel = { going: 'Going', maybe: 'Maybe', declined: "Can't go", invited: 'Invited' };

export function statusPill(m, trip) {
  if (trip.me && m.id === trip.me.id) return `<span class="pill you">You</span>`;
  if (m.isOrganizer) return `<span class="pill org">${icon('crown')}Organizer</span>`;
  if (!m.joined) return `<span class="pill invited">Hasn't joined</span>`;
  return `<span class="pill ${m.rsvp}">${rsvpLabel[m.rsvp]}</span>`;
}

// Days from today, for sorting "happening soon" first.
export const soon = (iso) => (iso ? daysUntil(iso) : 9999);

export const tripCover = (trip) => coverBg(trip.destination || trip.name, trip.cover?.url ?? trip.cover);
