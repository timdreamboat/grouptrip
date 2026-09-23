// Flights: boarding-pass cards sorted by who lands first, a live map per
// flight (embedded), and "add my flight" with automatic time lookup.
import { esc, icon, avatar, fmtDay, fmtTime, sheet, embedSheet, confirmSheet, busy, toast, emptyState } from '../ui.js';
import * as store from '../store.js';
import * as embed from '../embeds.js';
import { going, flightsOf, memberById, firstName } from './common.js';

const arrivalKey = (f) => `${f.arrDate || f.date}T${f.arrTime || '99:99'}`;

export function render(el, ctx) {
  const { trip } = ctx;
  const flights = [...trip.flights].sort((a, b) => arrivalKey(a).localeCompare(arrivalKey(b)));
  const g = going(trip);
  const missing = g.filter((m) => !flightsOf(trip, m.id).length);
  const iNeed = trip.me && !flightsOf(trip, trip.me.id).length && memberById(trip, trip.me.id)?.rsvp !== 'declined';

  // Group by arrival day
  const groups = [];
  for (const f of flights) {
    const day = f.arrDate || f.date;
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1).items.push(f);
  }

  el.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="display">Flights</h1>
        <div class="sub">${g.length ? `${g.length - missing.length} of ${g.length} going have added a flight` : 'Who lands when'}</div>
      </div>
      <button class="btn page-action" data-action="add">${icon('plus')}${iNeed || !trip.me ? 'Add my flight' : 'Add flight'}</button>
    </header>

    ${iNeed && flights.length ? `
      <button class="card row-link" data-action="add" style="display:flex;gap:14px;align-items:center;width:100%;text-align:left;margin-bottom:20px;border-style:dashed;cursor:pointer">
        <div class="tl-icon">${icon('plane')}</div>
        <div style="flex:1"><div style="font-weight:600">Add your flight</div><div class="small muted">Everyone can see when you land. Takes 10 seconds.</div></div>
        ${icon('chevron')}
      </button>` : ''}

    ${flights.length ? groups.map((grp) => `
      <section style="margin-bottom:24px">
        <div class="day-head"><h3>${esc(fmtDay(grp.day, { weekday: 'long', month: 'short', day: 'numeric' }))}</h3>
          <span class="small muted">${grp.items.length} arriving</span></div>
        <div class="stack">${grp.items.map((f) => pass(f, ctx)).join('')}</div>
      </section>`).join('')
    : `<div class="card">${emptyState('plane', 'No flights yet', 'Add a flight number and date — we fill in the airports and times.',
        `<button class="btn btn-primary" data-action="add">${icon('plus')}Add my flight</button>`)}</div>`}

    ${missing.length && flights.length ? `
      <section>
        <div class="section-head"><h2>Still missing</h2><span class="sub">${missing.length}</span></div>
        <div class="card card-tight rows">
          ${missing.map((m) => `
            <div class="row">${avatar(m, 36)}
              <div class="grow"><div class="title">${esc(m.id === trip.me?.id ? 'You' : m.name)}</div><div class="sub">No flight yet</div></div>
              ${ctx.isOrg || m.id === trip.me?.id ? `<button class="btn btn-xs btn-secondary" data-add-for="${m.id}">${icon('plus')}Add</button>` : ''}
            </div>`).join('')}
        </div>
      </section>` : ''}`;

  el.onclick = async (e) => {
    const t = e.target.closest('[data-action],[data-add-for],[data-live],[data-del]');
    if (!t) return;
    if (t.dataset.action === 'add') return openAddFlight(ctx);
    if (t.dataset.addFor) return openAddFlight(ctx, t.dataset.addFor);
    if (t.dataset.live) {
      const f = trip.flights.find((x) => x.id === t.dataset.live);
      const p = embed.parseFlight(f.flightNumber);
      return embedSheet(`${f.flightNumber} · live`, embed.liveFlightMap(p?.callsign ?? f.flightNumber));
    }
    if (t.dataset.del) {
      const ok = await confirmSheet({ title: 'Remove this flight?', message: 'It will disappear for everyone on the trip.', confirm: 'Remove', danger: true });
      if (ok) ctx.run(() => store.removeFlight(trip.id, t.dataset.del), 'Flight removed');
    }
  };
}

function pass(f, { trip, isOrg }) {
  const m = memberById(trip, f.memberId);
  const mine = trip.me && f.memberId === trip.me.id;
  const p = embed.parseFlight(f.flightNumber);
  const pretty = p ? p.iata.replace(/^([A-Z0-9]{2})/, '$1 ') : f.flightNumber;
  const landsLater = f.arrDate && f.arrDate !== f.date;
  return `
  <article class="pass ${mine ? 'mine' : ''}">
    <div class="pass-top">
      ${avatar(m, 34)}
      <div class="grow"><div style="font-weight:600">${esc(mine ? 'You' : m?.name)}</div>
        <div class="small muted">${esc(fmtDay(f.date))}</div></div>
      <span class="chip tabular">${esc(pretty)}</span>
    </div>
    <div class="pass-route">
      <div><div class="code">${esc(f.depAirport || '···')}</div>
        <div class="when">${f.depTime ? `<b>${esc(fmtTime(f.depTime))}</b>` : 'Departs'}</div></div>
      <div class="pass-line">${icon('plane')}</div>
      <div class="end"><div class="code">${esc(f.arrAirport || '···')}</div>
        <div class="when">${f.arrTime ? `<b>${esc(fmtTime(f.arrTime))}</b>` : 'Lands'}${landsLater ? ` · ${esc(fmtDay(f.arrDate, { month: 'short', day: 'numeric' }))}` : ''}</div></div>
    </div>
    <div class="pass-foot">
      <button class="btn btn-xs btn-secondary" data-live="${f.id}">${icon('radar')}Live map</button>
      <a class="btn btn-xs btn-ghost" href="${esc(embed.flightAwareLink(p?.callsign ?? f.flightNumber))}" target="_blank" rel="noopener">FlightAware ${icon('external')}</a>
      <span class="spacer"></span>
      ${mine || isOrg ? `<button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${f.id}" aria-label="Remove flight">${icon('trash')}</button>` : ''}
    </div>
  </article>`;
}

// Add a flight: number + date → we look up the rest, then confirm.
export function openAddFlight(ctx, forMemberId) {
  const { trip, isOrg } = ctx;
  const who = forMemberId || trip.me.id;
  const whoOptions = isOrg
    ? `<div class="field"><span>Whose flight?</span><div class="picks">${going(trip).concat(trip.members.filter((m) => m.rsvp !== 'going' && m.rsvp !== 'declined'))
        .filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i)
        .map((m) => `<label><input type="radio" name="memberId" value="${m.id}" ${m.id === who ? 'checked' : ''}>
          <span class="pick">${avatar(m, 30)}${esc(m.id === trip.me.id ? 'Me' : firstName(m.name))}</span></label>`).join('')}</div></div>`
    : `<input type="hidden" name="memberId" value="${who}">`;

  sheet({
    title: who === trip.me.id && !isOrg ? 'Add your flight' : 'Add a flight',
    body: `
      <form class="form" id="flight-form">
        ${whoOptions}
        <div class="grid-2">
          <label class="field"><span>Flight number</span><input name="flightNumber" required placeholder="UA 1234" autocomplete="off" autocapitalize="characters"></label>
          <label class="field"><span>Date</span><input type="date" name="date" required value="${esc(trip.startDate || '')}"></label>
        </div>
        <button type="button" class="btn btn-secondary btn-block" data-lookup>${icon('search')}Find my flight</button>
        <div id="preview"></div>
        <details class="more" id="manual">
          <summary>Enter times myself</summary>
          <div class="grid-4">
            <label class="field"><span>From</span><input name="depAirport" maxlength="4" placeholder="SFO" autocapitalize="characters"></label>
            <label class="field"><span>Departs</span><input type="time" name="depTime"></label>
            <label class="field"><span>To</span><input name="arrAirport" maxlength="4" placeholder="RNO" autocapitalize="characters"></label>
            <label class="field"><span>Lands</span><input type="time" name="arrTime"></label>
          </div>
          <label class="field" style="margin-top:12px"><span>Landing date (if different)</span><input type="date" name="arrDate"></label>
        </details>
      </form>`,
    foot: `<button class="btn btn-primary btn-lg" form="flight-form">Save flight</button>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#flight-form');
      const preview = dlg.querySelector('#preview');
      const lookupBtn = dlg.querySelector('[data-lookup]');
      const lookup = async () => {
        const p = embed.parseFlight(form.flightNumber.value);
        if (!p || !form.date.value) { toast('Enter a flight number like "UA 1234" and a date', { error: true }); return; }
        preview.innerHTML = '<div class="skeleton" style="height:120px"></div>';
        const r = await busy(lookupBtn, () => store.lookupFlight(p.iata, form.date.value));
        if (!r) { preview.innerHTML = ''; form.querySelector('#manual').open = true; return; }
        for (const k of ['depAirport', 'depTime', 'arrAirport', 'arrTime', 'arrDate']) form[k].value = r[k] || '';
        preview.innerHTML = `<div class="pass"><div class="pass-route">
          <div><div class="code">${esc(r.depAirport)}</div><div class="when"><b>${esc(fmtTime(r.depTime))}</b></div></div>
          <div class="pass-line">${icon('plane')}</div>
          <div class="end"><div class="code">${esc(r.arrAirport)}</div><div class="when"><b>${esc(fmtTime(r.arrTime))}</b>${r.arrDate ? ` · ${esc(fmtDay(r.arrDate, { month: 'short', day: 'numeric' }))}` : ''}</div></div>
        </div></div><p class="hint" style="margin-top:8px">${icon('check')} Found it. Scheduled times, local to each airport.</p>`;
      };
      lookupBtn.onclick = lookup;
      form.flightNumber.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const p = embed.parseFlight(form.flightNumber.value);
        if (!p) return toast('Enter a flight number like "UA 1234"', { error: true });
        const f = Object.fromEntries(new FormData(form));
        const ok = await busy(dlg.querySelector('.sheet-foot .btn'), () => store.addFlight(trip.id, {
          memberId: f.memberId, flightNumber: p.iata, date: f.date,
          depAirport: f.depAirport.trim(), depTime: f.depTime, arrAirport: f.arrAirport.trim(), arrTime: f.arrTime,
          arrDate: f.arrDate && f.arrDate !== f.date ? f.arrDate : '',
        }));
        if (ok) { close(); ctx.refresh('Flight added'); }
      };
      setTimeout(() => form.flightNumber.focus(), 50);
    },
  });
}
