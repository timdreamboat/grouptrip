// Where we're staying: address, check-in/out, confirmation, map, booking link.
import { esc, icon, avatar, avatarStack, fmtDay, fmtTime, sheet, embedSheet, confirmSheet, busy, copy, toast, emptyState } from '../ui.js';
import { guestsOf, namesOf, firstName } from './common.js';
import * as store from '../store.js';
import * as embed from '../embeds.js';
import { hasGoogleKey, googleFindPlace, stayQuery } from './tripmap.js';

const nights = (a, b) => (a && b ? Math.round((new Date(`${b}T00:00`) - new Date(`${a}T00:00`)) / 86400000) : 0);
const when = (d, t) => `<div style="font-weight:600">${esc(fmtDay(d))}</div>${t ? `<div class="small muted">${esc(fmtTime(t))}</div>` : ''}`;

export function stayCard(s, ctx) {
  const { isOrg, trip } = ctx;
  const n = nights(s.checkIn, s.checkOut);
  const guests = trip ? guestsOf(trip, s) : [];
  const imHere = trip?.me && (s.guests || []).includes(trip.me.id);
  return `
  <article class="card stay">
    <div class="title-row" style="display:flex;gap:12px;align-items:flex-start">
      <div class="tl-icon">${icon('bed')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:17px">${esc(s.name)}</div>
        ${s.address ? `<div class="place small muted" style="display:flex;gap:6px;align-items:center;margin-top:2px">${icon('pin', 'tiny')}${esc(s.address)}</div>` : ''}
      </div>
      ${isOrg ? `<button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-stay-edit="${s.id}" aria-label="Edit stay">${icon('pencil')}</button>
        <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-stay-del="${s.id}" aria-label="Remove stay">${icon('trash')}</button>` : ''}
    </div>
    ${s.checkIn || s.checkOut ? `
    <div class="stay-dates">
      <div><div class="eyebrow">Check in</div><div class="tabular">${s.checkIn ? when(s.checkIn, s.checkInTime) : '—'}</div></div>
      <div class="nights">${n ? `${n} night${n === 1 ? '' : 's'}` : ''}</div>
      <div style="text-align:right"><div class="eyebrow">Check out</div><div class="tabular">${s.checkOut ? when(s.checkOut, s.checkOutTime) : '—'}</div></div>
    </div>` : ''}
    ${trip ? `
    <div class="stay-guests">
      ${guests.length ? `${avatarStack(guests, 5, 26)}<span class="small"><b>${esc(namesOf(guests, trip.me?.id))}</b> ${guests.length === 1 && !imHere ? 'is' : 'are'} staying here</span>`
        : '<span class="small muted">Nobody added yet</span>'}
      ${trip.me ? `<button class="btn btn-xs ${imHere ? 'btn-ghost' : 'btn-secondary'}" data-stay-me="${s.id}" data-on="${!imHere}">${imHere ? 'Not me' : "I'm staying here"}</button>` : ''}
    </div>` : ''}
    ${s.notes ? `<p class="small muted" style="margin:12px 0 0;white-space:pre-wrap">${esc(s.notes)}</p>` : ''}
    <div class="tl-actions">
      ${s.address ? `<button class="btn btn-sm btn-secondary" data-stay-map="${s.id}">${icon('map')}Map</button>` : ''}
      ${s.confirmation ? `<button class="btn btn-sm btn-secondary" data-stay-conf="${s.id}">${icon('copy')}${esc(s.confirmation)}</button>` : ''}
      ${s.bookingUrl ? `<a class="btn btn-sm btn-outline" href="${esc(s.bookingUrl)}" target="_blank" rel="noopener">Booking ${icon('external')}</a>` : ''}
    </div>
  </article>`;
}

export function staysSection(ctx, { heading = true } = {}) {
  const { trip, isOrg } = ctx;
  return `
  <section>
    ${heading ? `<div class="section-head"><h2>Where we're staying</h2>
      ${isOrg ? `<button class="btn btn-xs btn-secondary" data-stay-add>${icon('plus')}Add</button>` : ''}</div>` : ''}
    ${trip.stays.length ? `<div class="stack">${trip.stays.map((s) => stayCard(s, ctx)).join('')}</div>`
      : `<div class="card">${isOrg
        ? emptyState('bed', 'Add where you\'re staying', 'Hotel, Airbnb, cabin — address, check-in times and the confirmation, all in one place.',
            `<button class="btn btn-primary" data-stay-add>${icon('plus')}Add a place</button>`)
        : emptyState('bed', 'No place added yet', 'The organizer will add where you\'re staying.')}</div>`}
  </section>`;
}

// Handles stay buttons anywhere inside `el`. Returns true if it handled the click.
export async function handleStayClick(e, ctx) {
  const t = e.target.closest('[data-stay-add],[data-stay-del],[data-stay-map],[data-stay-conf],[data-stay-edit],[data-stay-me]');
  if (!t) return false;
  const { trip } = ctx;
  const s = trip.stays.find((x) => x.id === (t.dataset.stayDel || t.dataset.stayMap || t.dataset.stayConf || t.dataset.stayEdit));
  if (t.dataset.stayMe) {
    const on = t.dataset.on === 'true';
    ctx.run(() => store.setMyStay(trip.id, t.dataset.stayMe, on), on ? "Got it — you're staying there" : 'Removed you from that place');
    return true;
  }
  if (t.hasAttribute('data-stay-add')) openAddStay(ctx);
  else if (t.dataset.stayEdit) openAddStay(ctx, s);
  else if (t.dataset.stayMap) embedSheet(s.name, embed.mapEmbed(s.address));
  else if (t.dataset.stayConf) copy(s.confirmation, 'Confirmation copied');
  else if (t.dataset.stayDel) {
    const ok = await confirmSheet({ title: `Remove ${s.name}?`, message: 'It will be removed for everyone.', confirm: 'Remove', danger: true });
    if (ok) ctx.run(() => store.removeStay(trip.id, s.id), 'Stay removed');
  }
  return true;
}

// Add a place to stay, or edit one (pass the stay).
export function openAddStay(ctx, stay = null) {
  const { trip } = ctx;
  const v = (k, fallback = '') => esc(stay ? stay[k] ?? '' : fallback);
  const people = trip.members.filter((m) => m.rsvp !== 'declined' || (stay?.guests || []).includes(m.id));
  // New place: everyone going if it's the first one, otherwise nobody yet.
  const guestDefault = (m) => (stay ? (stay.guests || []).includes(m.id) : !trip.stays.length && m.rsvp === 'going');
  sheet({
    title: stay ? 'Edit place' : 'Where are you staying?',
    body: `
      <form class="form" id="stay-form">
        <label class="field"><span>Name</span><input name="name" required maxlength="200" placeholder="Aria, Airbnb on Lakeshore…" value="${v('name')}"></label>
        <label class="field"><span>Address</span><input name="address" placeholder="Street, city" value="${v('address')}"></label>
        <div class="grid-2">
          <label class="field"><span>Check in</span><input type="date" name="checkIn" value="${v('checkIn', trip.startDate || '')}"></label>
          <label class="field"><span>Time</span><input type="time" name="checkInTime" value="${v('checkInTime', '15:00')}"></label>
          <label class="field"><span>Check out</span><input type="date" name="checkOut" value="${v('checkOut', trip.endDate || '')}"></label>
          <label class="field"><span>Time</span><input type="time" name="checkOutTime" value="${v('checkOutTime', '11:00')}"></label>
        </div>
        <div class="field"><span>Who's staying here?</span><div class="picks">
          ${people.map((m) => `<label><input type="checkbox" name="guest" value="${m.id}" ${guestDefault(m) ? 'checked' : ''}>
            <span class="pick">${avatar(m, 30)}${esc(m.id === trip.me.id ? 'Me' : firstName(m.name))}</span></label>`).join('')}</div></div>
        <label class="field"><span>Confirmation number</span><input name="confirmation" autocomplete="off" value="${v('confirmation')}"></label>
        <label class="field"><span>Booking link</span><input name="bookingUrl" type="url" placeholder="Airbnb, hotel or VRBO page" value="${v('bookingUrl')}"></label>
        <label class="field"><span>Notes</span><textarea name="notes" rows="3" placeholder="Parking, which rooms, how to get the key…">${v('notes')}</textarea></label>
      </form>`,
    foot: `<button class="btn btn-primary btn-lg" form="stay-form">${stay ? 'Save changes' : 'Save place'}</button>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#stay-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        if (f.checkIn && f.checkOut && f.checkOut < f.checkIn) return toast('Check-out is before check-in', { error: true });
        const ok = await busy(dlg.querySelector('.sheet-foot .btn'), async () => {
          // Pin it on the map (with a Google key); keep the old pin if the place didn't change.
          const same = stay && stay.name === f.name.trim() && (stay.address || '') === f.address.trim();
          let at = same && stay.lat != null ? { lat: stay.lat, lon: stay.lon } : null;
          if (!same && hasGoogleKey) at = await googleFindPlace(stayQuery({ name: f.name.trim(), address: f.address.trim() }, trip), trip).catch(() => null);
          const data = { ...f, lat: at?.lat ?? '', lon: at?.lon ?? '', guests: [...form.querySelectorAll('[name=guest]:checked')].map((c) => c.value) };
          delete data.guest;
          return stay ? store.updateStay(trip.id, stay.id, data) : store.addStay(trip.id, data);
        });
        if (ok) { close(); ctx.refresh(stay ? 'Place updated' : 'Place added'); }
      };
      setTimeout(() => form.elements.name.focus(), 50);
    },
  });
}
