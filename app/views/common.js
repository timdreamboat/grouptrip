// Pieces shared by several trip screens.
import { esc, icon, coverBg, avatarStack, fmtRange, countdown, daysUntil, safeUrl } from '../ui.js';
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
    ${trip.cover?.credit ? (safeUrl(trip.cover.link)
      ? `<a class="hero-credit" href="${esc(safeUrl(trip.cover.link))}" target="_blank" rel="noopener noreferrer">${esc(trip.cover.credit)}</a>`
      : `<span class="hero-credit">${esc(trip.cover.credit)}</span>`) : ''}
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

// Where someone is staying (on a given day, if the stay has dates).
export function stayOf(trip, memberId, day = null) {
  const mine = trip.stays.filter((st) => (st.guests || []).includes(memberId));
  if (!day) return mine[0] ?? null;
  return mine.find((st) => (!st.checkIn || st.checkIn <= day) && (!st.checkOut || st.checkOut >= day)) ?? mine[0] ?? null;
}
export const guestsOf = (trip, st) => (st.guests || []).map((id) => memberById(trip, id)).filter(Boolean);
export const namesOf = (people, meId) =>
  people.map((m) => (m.id === meId ? 'you' : firstName(m.name))).join(', ').replace(/^you/, 'You');

// ---------- trip types: words and suggestions that change with the kind of trip ----------
export const KINDS = {
  friends: {
    label: 'Friends', blurb: 'Split costs, settle up with Venmo',
    crew: 'crew', plan: 'Calendar', addPlan: 'Add plan', money: 'Money', groupList: "Who's bringing what",
    groupIdeas: ['Sunscreen', 'Bluetooth speaker', 'First-aid kit', 'Snacks', 'Drinks', 'Coffee', 'Card games', 'Bug spray', 'Beach towels', 'Phone tripod'],
    packIdeas: ['ID / passport', 'Phone charger', 'Wallet', 'Medications', 'Toiletries', 'Sunglasses', 'Headphones', 'Swimsuit', 'Jacket', 'Comfortable shoes'],
  },
  family: {
    label: 'Family', blurb: 'Split by household, kid-friendly lists',
    crew: 'family', plan: 'Calendar', addPlan: 'Add plan', money: 'Money', groupList: "Who's bringing what",
    groupIdeas: ['Sunscreen', 'First-aid kit', 'Snacks for the kids', 'Board games', 'Beach toys', 'Car seats', 'Stroller', 'Bug spray', 'Coffee', 'Paper towels'],
    packIdeas: ['ID / passport', "Kids' medications", 'Phone charger', 'Tablets & headphones', 'Swimsuits', 'Jackets', 'Toiletries', 'Diapers & wipes', 'Comfort toy', 'Snacks for the drive'],
  },
  business: {
    label: 'Business', blurb: 'Agenda, reimbursable expenses, export',
    crew: 'team', plan: 'Agenda', addPlan: 'Add to agenda', money: 'Expenses', groupList: 'Shared supplies',
    groupIdeas: ['Booth materials', 'Banner', 'Swag', 'Business cards', 'Extension cord', 'Clicker', 'Printed handouts', 'Snacks for the booth'],
    packIdeas: ['Laptop & charger', 'Badge / registration', 'Business cards', 'Portable battery', 'Notebook', 'Dress clothes', 'ID / passport', 'Presentation backup', 'Headphones', 'Comfortable shoes'],
  },
};
export const words = (trip) => KINDS[trip?.kind] ?? KINDS.friends;
export const isBusiness = (trip) => trip?.kind === 'business';

export const CATEGORIES = [
  ['travel', '✈️', 'Airfare & travel'], ['lodging', '🏨', 'Lodging'], ['meals', '🍽', 'Meals'],
  ['transport', '🚕', 'Ground transport'], ['entertainment', '🥂', 'Client entertainment'],
  ['supplies', '📦', 'Supplies'], ['other', '•', 'Other'],
];
export const categoryOf = (key) => CATEGORIES.find((c) => c[0] === key) ?? CATEGORIES.at(-1);
