// "Today" — the top of Home while the trip is happening: what's next (with a
// live countdown), the rest of today, flights today, where we're staying, and
// quick actions. Times are the phone's local time (you're at the destination).
import { esc, icon, avatar, fmtDay, fmtTime, tripDays, embedSheet, copy } from '../ui.js';
import * as embed from '../embeds.js';
import { memberById, firstName, stayOf } from './common.js';
import { placeQuery } from './tripmap.js';

const pad = (n) => String(n).padStart(2, '0');
const localIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export function isHappening(trip) {
  if (!trip.startDate) return false;
  const today = localIso();
  return today >= trip.startDate && today <= (trip.endDate || trip.startDate);
}

// "in 45 min", "in 2 hr 10 min", "now", "started 20 min ago"
function until(mins) {
  if (mins <= 0 && mins > -45) return mins === 0 ? 'now' : `started ${-mins} min ago`;
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `in ${h} hr${m ? ` ${m} min` : ''}`;
}

export function todayCard(ctx) {
  const { trip, isOrg } = ctx;
  if (!isHappening(trip)) return '';
  const today = localIso();
  const days = tripDays(trip);
  const dayNo = days.indexOf(today) + 1;
  const now = nowMinutes();

  const plans = trip.itinerary.filter((i) => i.day === today);
  // Next up: the first timed plan that hasn't been going for 45+ min, else the first untimed one.
  const next = plans.find((p) => p.time && minutesOf(p.time) - now > -45) ?? plans.find((p) => !p.time) ?? null;
  const later = plans.filter((p) => p !== next && (!p.time || !next?.time || minutesOf(p.time) > minutesOf(next.time)));

  const flights = trip.flights.filter((f) => f.date === today || (f.arrDate || f.date) === today);
  // Your own hotel tonight, else wherever the group is staying.
  const stay = stayOf(trip, trip.me.id, today)
    ?? trip.stays.find((st) => st.checkIn && st.checkIn <= today && (!st.checkOut || st.checkOut >= today));
  const stayNote = stay && (stay.checkIn === today ? `Check-in today${stay.checkInTime ? ` from ${fmtTime(stay.checkInTime)}` : ''}`
    : stay.checkOut === today ? `Check-out today${stay.checkOutTime ? ` by ${fmtTime(stay.checkOutTime)}` : ''}` : '');

  const flightStatus = (f) => {
    const landsToday = (f.arrDate || f.date) === today;
    if (landsToday && f.arrTime && now >= minutesOf(f.arrTime)) return { text: 'Landed', cls: 'going' };
    if (f.date === today && f.depTime && now >= minutesOf(f.depTime)) return { text: 'In the air', cls: 'maybe' };
    if (f.date === today && f.depTime) return { text: `Departs ${fmtTime(f.depTime)}`, cls: 'declined' };
    return { text: landsToday && f.arrTime ? `Lands ${fmtTime(f.arrTime)}` : 'Today', cls: 'declined' };
  };

  return `
  <section class="today stack">
    <div class="today-head">
      <div class="eyebrow">${dayNo ? `Today · Day ${dayNo} of ${days.length}` : 'Today'}</div>
      <h2 class="display">${esc(fmtDay(today, { weekday: 'long' }))}</h2>
    </div>

    ${next ? `
    <article class="card today-next">
      <div class="eyebrow" style="color:var(--accent-ink)">${next.time ? `Next · <span data-countdown="${esc(next.time)}">${esc(until(minutesOf(next.time) - now))}</span>` : 'Today'}</div>
      <div class="today-title">${esc(next.title)}</div>
      <div class="small muted">${[next.time && fmtTime(next.time), next.place].filter(Boolean).map(esc).join(' · ')}</div>
      ${next.notes ? `<div class="pin-notes" style="margin-top:10px">${esc(next.notes)}</div>` : ''}
      <div class="tl-actions">
        ${next.place ? `<a class="btn btn-sm btn-primary" target="_blank" rel="noopener"
          href="https://www.google.com/maps/dir/?api=1&destination=${next.lat != null ? `${next.lat},${next.lon}` : encodeURIComponent(placeQuery(next, trip))}">${icon('map')}Directions</a>` : ''}
        ${next.opentableRid ? `<button class="btn btn-sm btn-secondary" data-today-ot="${next.id}">${icon('utensils')}Reservation</button>` : ''}
      </div>
    </article>` : `
    <article class="card today-next">
      <div class="today-title">Nothing planned today</div>
      <div class="small muted">Enjoy the free day${isOrg ? ' — or add something to the plan' : ''}.</div>
      ${isOrg ? `<div class="tl-actions"><a class="btn btn-sm btn-secondary" href="#/t/${trip.id}/plan">${icon('plus')}Add a plan</a></div>` : ''}
    </article>`}

    ${later.length ? `
    <div class="card card-tight rows">
      ${later.map((p) => `
        <a class="row row-link" href="#/t/${trip.id}/plan" style="text-decoration:none;min-height:52px">
          <span class="tl-time" style="padding:0;width:62px;text-align:left">${p.time ? esc(fmtTime(p.time)) : 'Anytime'}</span>
          <span class="grow"><div class="title">${esc(p.title)}</div>${p.place ? `<div class="sub">${esc(p.place)}</div>` : ''}</span>
          ${icon('chevron')}
        </a>`).join('')}
    </div>` : ''}

    ${flights.length ? `
    <div class="card card-tight rows">
      ${flights.map((f) => {
        const m = memberById(trip, f.memberId);
        const st = flightStatus(f);
        return `
        <div class="row">
          ${avatar(m, 34)}
          <div class="grow"><div class="title">${esc(f.memberId === trip.me.id ? 'You' : firstName(m?.name))} · ${esc(f.flightNumber)}</div>
            <div class="sub">${esc(f.depAirport || '')}${f.depTime ? ` ${esc(fmtTime(f.depTime))}` : ''} → ${esc(f.arrAirport || '')}${f.arrTime ? ` ${esc(fmtTime(f.arrTime))}` : ''}</div></div>
          <span class="pill ${st.cls}">${esc(st.text)}</span>
          <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-today-live="${f.id}" aria-label="Live map">${icon('radar')}</button>
        </div>`;
      }).join('')}
    </div>` : ''}

    ${stay ? `
    <article class="card">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div class="tl-icon" style="background:var(--text);color:var(--bg)">${icon('bed')}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(stay.name)}</div>
          ${stay.address ? `<div class="small muted">${esc(stay.address)}</div>` : ''}
          ${stayNote ? `<span class="pill maybe" style="margin-top:6px">${esc(stayNote)}</span>` : ''}
        </div>
      </div>
      <div class="tl-actions">
        <a class="btn btn-sm btn-primary" target="_blank" rel="noopener"
          href="https://www.google.com/maps/dir/?api=1&destination=${stay.lat != null ? `${stay.lat},${stay.lon}` : encodeURIComponent([stay.name, stay.address].filter(Boolean).join(', '))}">${icon('map')}Directions</a>
        ${stay.confirmation ? `<button class="btn btn-sm btn-secondary" data-today-conf="${stay.id}">${icon('copy')}${esc(stay.confirmation)}</button>` : ''}
      </div>
    </article>` : ''}

    <div class="today-actions">
      <a class="btn btn-secondary btn-sm" href="#/t/${trip.id}/money">${icon('wallet')}Add expense</a>
      <a class="btn btn-secondary btn-sm" href="#/t/${trip.id}/photos">${icon('sparkle')}Add photos</a>
      <a class="btn btn-secondary btn-sm" href="#/t/${trip.id}/plan">${icon('map')}Map</a>
    </div>
  </section>`;
}

// Keep "in 45 min" fresh while Home is open.
let ticker;
export function startTodayTicker(el) {
  clearInterval(ticker);
  if (!el.querySelector('[data-countdown]')) return;
  ticker = setInterval(() => {
    const spans = el.querySelectorAll('[data-countdown]');
    if (!spans.length || !el.isConnected) return clearInterval(ticker);
    spans.forEach((s) => { s.textContent = until(minutesOf(s.dataset.countdown) - nowMinutes()); });
  }, 30000);
}

export function handleTodayClick(e, { trip }) {
  const t = e.target.closest('[data-today-live],[data-today-conf],[data-today-ot]');
  if (!t) return false;
  if (t.dataset.todayLive) {
    const f = trip.flights.find((x) => x.id === t.dataset.todayLive);
    const p = embed.parseFlight(f.flightNumber);
    embedSheet(`${f.flightNumber} · live`, embed.liveFlightMap(p?.callsign ?? f.flightNumber));
  } else if (t.dataset.todayConf) {
    copy(trip.stays.find((x) => x.id === t.dataset.todayConf).confirmation, 'Confirmation copied');
  } else if (t.dataset.todayOt) {
    const it = trip.itinerary.find((x) => x.id === t.dataset.todayOt);
    embedSheet(`Reservation · ${it.title}`, embed.openTableEmbed(it.opentableRid, { day: it.day, time: it.time }));
  }
  return true;
}
