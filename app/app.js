import * as store from './store.js';
import { toCents, fmt, equalShares, balances, settleUp } from './money.js';
import * as embed from './embeds.js';

const view = document.getElementById('view');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (d) => d
  ? new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  : '';

const dateRange = (t) =>
  `${esc(t.destination)}${t.startDate ? ' · ' + fmtDate(t.startDate) : ''}${t.endDate ? ' – ' + fmtDate(t.endDate) : ''}`;

// A partner site shown inside GroupTrip, opened on demand so pages stay fast.
const frame = (src, title, height = 420) =>
  `<iframe class="embed" src="${esc(src)}" title="${esc(title)}" height="${height}" loading="lazy"
     referrerpolicy="no-referrer-when-downgrade"></iframe>`;

const external = (href, label) =>
  `<a class="btn ghost-btn" href="${esc(href)}" target="_blank" rel="noopener">${label} ↗</a>`;

// ---------- routing: #/  |  #/trip/<id>/<tab> ----------
let current = { tripId: null, tab: null };

async function route() {
  const [, page, id, tab = 'people'] = location.hash.split('/');
  if (page !== 'trip') return renderHome();
  current = { tripId: id, tab };
  try {
    renderTrip(await store.getTrip(id), tab);
  } catch (err) {
    view.innerHTML = `<h1>Trip not found</h1><p class="sub">${esc(err.message)}</p><p><a href="#/">Back to your trips</a></p>`;
  }
}
window.addEventListener('hashchange', route);
// Pick up changes others made while this tab was in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current.tripId && !view.querySelector('iframe')) route();
});
route();

// Run a change, then re-read the trip. Errors show as a simple alert.
async function act(fn) {
  try { await fn(); } catch (err) { alert(err.message); return false; }
  await route();
  return true;
}

// ---------- home ----------
async function renderHome() {
  current = { tripId: null, tab: null };
  const trips = await store.listTrips();
  view.innerHTML = `
    <h1>Your trips</h1>
    <p class="sub">Plan together, split costs, settle up.</p>
    ${store.shared ? '' : '<p class="note">Trips are saved on this device only until sharing is switched on.</p>'}
    <div class="card">
      ${trips.length ? `<ul class="list">${trips.map((t) => `
        <li><a class="trip" href="#/trip/${esc(t.id)}">
          <strong>${esc(t.name)}</strong>
          <div class="meta">${dateRange(t)}</div>
        </a></li>`).join('')}</ul>`
      : '<p class="empty">No trips yet — start one below, or open a share link from a friend.</p>'}
    </div>
    <div class="card">
      <h2>New trip</h2>
      <form id="new-trip">
        <label>Trip name<input name="name" required maxlength="120" placeholder="Lake weekend"></label>
        <label>Destination<input name="destination" placeholder="Lake Tahoe"></label>
        <div class="row">
          <label>Start<input type="date" name="startDate"></label>
          <label>End<input type="date" name="endDate"></label>
          <label>Currency<input name="currency" value="USD" maxlength="3"></label>
        </div>
        <div><button>Create trip</button></div>
      </form>
    </div>`;
  view.querySelector('#new-trip').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.currency = f.currency.trim().toUpperCase() || 'USD';
    try {
      const id = await store.createTrip(f);
      location.hash = `#/trip/${id}/people`;
    } catch (err) { alert(err.message); }
  };
}

// ---------- trip ----------
const TABS = { people: 'People', flights: 'Flights', plan: 'Itinerary', expenses: 'Expenses', settle: 'Settle up' };

function renderTrip(trip, tab) {
  if (!TABS[tab]) tab = 'people';
  const id = trip.id;
  const name = (mid) => trip.members.find((m) => m.id === mid)?.name ?? 'Someone';
  const money = (c) => fmt(c, trip.currency);
  const memberOptions = trip.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

  const body = {
    people: () => `
      <div class="card">
        <h2>Who's coming</h2>
        ${trip.members.length ? `<ul class="list">${trip.members.map((m) => `
          <li><span>${esc(m.name)}</span>
          <button class="ghost" data-del-member="${m.id}" title="Remove">✕</button></li>`).join('')}</ul>`
        : '<p class="empty">Add the people on this trip.</p>'}
      </div>
      <div class="card">
        <form id="add-member" class="row">
          <input name="name" required maxlength="80" placeholder="Name">
          <div style="flex:0 0 auto"><button>Add person</button></div>
        </form>
      </div>
      <p><button class="ghost" id="del-trip">Delete this trip</button></p>`,

    flights: () => {
      if (!trip.members.length) return '<div class="card"><p class="empty">Add people first, then their flights.</p></div>';
      const key = (f) => `${f.arrDate || f.date}T${f.arrTime || '99:99'}`;
      const flights = [...trip.flights].sort((a, b) => key(a).localeCompare(key(b)));
      return `
      <div class="card">
        <h2>Arrivals</h2>
        ${flights.length ? flights.map((f) => {
          const p = embed.parseFlight(f.flightNumber);
          const callsign = p?.callsign ?? f.flightNumber;
          return `
          <div class="flight">
            <div class="flight-row">
              <div>
                <strong>${esc(name(f.memberId))}</strong> · ${esc(f.flightNumber)}
                <div class="meta">${fmtDate(f.date)}${f.depAirport || f.depTime ? ` · ${esc(f.depAirport)} ${esc(f.depTime)}` : ''}
                  → ${esc(f.arrAirport) || '?'} ${esc(f.arrTime)}${f.arrDate && f.arrDate !== f.date ? ` (${fmtDate(f.arrDate)})` : ''}</div>
              </div>
              <button class="ghost" data-del-flight="${f.id}" title="Remove">✕</button>
            </div>
            <div class="actions">
              <button class="small" data-toggle="live-${f.id}">Live map</button>
              ${external(embed.flightAwareLink(callsign), 'Status on FlightAware')}
            </div>
            <div class="embed-slot" id="live-${f.id}" data-src="${esc(embed.liveFlightMap(callsign))}" data-title="Live map of ${esc(f.flightNumber)}" hidden></div>
          </div>`;
        }).join('') : '<p class="empty">No flights yet.</p>'}
        <p class="meta">The live map shows a plane only while it's in the air.</p>
      </div>
      <div class="card">
        <h2>Add a flight</h2>
        <form id="add-flight">
          <div class="row">
            <label>Who<select name="memberId">${memberOptions}</select></label>
            <label>Flight number<input name="flightNumber" required placeholder="UA 1234"></label>
            <label>Date<input type="date" name="date" required value="${esc(trip.startDate)}"></label>
          </div>
          <div><button type="button" class="small ghost-btn" id="lookup-flight">Fill in times automatically</button></div>
          <div class="row">
            <label>From (airport)<input name="depAirport" maxlength="4" placeholder="SFO"></label>
            <label>Departs<input type="time" name="depTime"></label>
            <label>To (airport)<input name="arrAirport" maxlength="4" placeholder="RNO"></label>
            <label>Lands<input type="time" name="arrTime"></label>
          </div>
          <label class="inline"><input type="checkbox" name="nextDay"> Lands the next day</label>
          <div><button>Add flight</button></div>
        </form>
      </div>`;
    },

    plan: () => {
      const items = [...trip.itinerary].sort((a, b) =>
        (a.day || '9999').localeCompare(b.day || '9999') || (a.time || '').localeCompare(b.time || ''));
      let lastDay = null;
      const covers = Math.max(trip.members.length, 1);
      return `
      ${trip.destination ? `<div class="card"><h2>${esc(trip.destination)}</h2>${frame(embed.mapEmbed(trip.destination), 'Map of ' + trip.destination, 260)}</div>` : ''}
      <div class="card">
        ${items.length ? items.map((it) => {
          const header = it.day !== lastDay ? `<div class="day">${it.day ? fmtDate(it.day) : 'Anytime'}</div>` : '';
          lastDay = it.day;
          return `${header}
          <div class="item">
            <div class="flight-row">
              <span>${it.time ? `<span class="meta">${esc(it.time)}</span> ` : ''}<strong>${esc(it.title)}</strong>
              ${it.notes ? `<div class="meta">${esc(it.notes)}</div>` : ''}</span>
              <button class="ghost" data-del-item="${it.id}" title="Remove">✕</button>
            </div>
            ${it.place || it.opentableRid || it.bookingUrl ? `<div class="actions">
              ${it.opentableRid ? `<button class="small" data-toggle="ot-${it.id}">Reserve on OpenTable</button>` : ''}
              ${it.place ? `<button class="small" data-toggle="map-${it.id}">Map</button>` : ''}
              ${it.bookingUrl ? external(it.bookingUrl, 'Booking page') : ''}
            </div>` : ''}
            ${it.opentableRid ? `<div class="embed-slot" id="ot-${it.id}" data-title="OpenTable booking for ${esc(it.title)}"
               data-src="${esc(embed.openTableEmbed(it.opentableRid, { covers, day: it.day, time: it.time }))}" data-height="560" hidden></div>` : ''}
            ${it.place ? `<div class="embed-slot" id="map-${it.id}" data-src="${esc(embed.mapEmbed(it.place))}" data-title="Map of ${esc(it.place)}" hidden></div>` : ''}
          </div>`;
        }).join('') : '<p class="empty">Nothing planned yet.</p>'}
      </div>
      <div class="card">
        <h2>Add to itinerary</h2>
        <form id="add-item">
          <div class="row">
            <label>Day<input type="date" name="day" value="${esc(trip.startDate)}"></label>
            <label>Time<input type="time" name="time"></label>
          </div>
          <label>What<input name="title" required maxlength="200" placeholder="Dinner at the pier"></label>
          <label>Notes<input name="notes" placeholder="Reservation under Tim"></label>
          <label>Place (shows a map)<input name="place" placeholder="Restaurant name and town, or an address"></label>
          <label>OpenTable link or restaurant ID (optional)
            <input name="opentable" placeholder="e.g. https://www.opentable.com/restref/client/?rid=1779"></label>
          <label>Other booking link (optional)<input name="bookingUrl" type="url" placeholder="Resy, hotel, tour…"></label>
          <p class="meta">Find restaurants: ${external(embed.openTableSearch(trip.destination), 'Search OpenTable')}</p>
          <div><button>Add</button></div>
        </form>
      </div>`;
    },

    expenses: () => {
      if (!trip.members.length) return '<div class="card"><p class="empty">Add people first, then log expenses.</p></div>';
      const total = trip.expenses.reduce((s, e) => s + e.amount, 0);
      return `
      <div class="card">
        <h2>Expenses · ${money(total)} total</h2>
        ${trip.expenses.length ? `<ul class="list">${trip.expenses.map((e) => `
          <li><span><strong>${esc(e.description)}</strong>
            <div class="meta">${esc(name(e.paidBy))} paid · split ${e.splits.length === trip.members.length ? 'everyone' : e.splits.map((s) => esc(name(s.memberId))).join(', ')}</div></span>
            <span><span class="amt">${money(e.amount)}</span>
            <button class="ghost" data-del-expense="${e.id}" title="Remove">✕</button></span></li>`).join('')}</ul>`
        : '<p class="empty">No expenses yet.</p>'}
      </div>
      <div class="card">
        <h2>Add expense</h2>
        <form id="add-expense">
          <div class="row">
            <label>What for<input name="description" required maxlength="200" placeholder="Groceries"></label>
            <label>Amount<input name="amount" required inputmode="decimal" placeholder="0.00"></label>
          </div>
          <label>Paid by<select name="paidBy">${memberOptions}</select></label>
          <label>Split equally between</label>
          <div class="checks">${trip.members.map((m) => `
            <label><input type="checkbox" name="split" value="${m.id}" checked> ${esc(m.name)}</label>`).join('')}</div>
          <div><button>Add expense</button></div>
        </form>
      </div>`;
    },

    settle: () => {
      const bal = balances(trip);
      const pays = settleUp(bal);
      return `
      <div class="card">
        <h2>Balances</h2>
        ${trip.members.length ? `<ul class="list">${trip.members.map((m) => {
          const v = bal[m.id] ?? 0;
          return `<li><span>${esc(m.name)}</span><span class="amt ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">
            ${v > 0 ? 'is owed ' + money(v) : v < 0 ? 'owes ' + money(-v) : 'all square'}</span></li>`;
        }).join('')}</ul>` : '<p class="empty">No one on this trip yet.</p>'}
      </div>
      <div class="card">
        <h2>Payments to settle up</h2>
        ${pays.length ? `<ul class="list">${pays.map((p) => `
          <li><span>${esc(name(p.from))} → ${esc(name(p.to))}</span>
          <span class="pay"><span class="amt">${money(p.amount)}</span>
          ${trip.currency === 'USD' ? external(embed.venmoLink(p.amount, `${trip.name}: ${name(p.from)} → ${name(p.to)}`), 'Venmo') : ''}</span></li>`).join('')}</ul>`
        : '<p class="empty">Everyone is square.</p>'}
      </div>`;
    },
  }[tab];

  view.innerHTML = `
    <div class="trip-head">
      <div>
        <h1>${esc(trip.name)}</h1>
        <p class="sub">${dateRange(trip)}</p>
      </div>
      ${store.shared ? '<button class="small" id="share">Copy share link</button>' : ''}
    </div>
    <nav class="tabs">${Object.entries(TABS).map(([k, label]) =>
      `<a href="#/trip/${esc(id)}/${k}" class="${k === tab ? 'on' : ''}">${label}</a>`).join('')}</nav>
    ${body()}`;

  // ----- wire up actions -----
  const onSubmit = (sel, fn) => {
    const el = view.querySelector(sel);
    if (el) el.onsubmit = (e) => { e.preventDefault(); fn(new FormData(e.target)); };
  };
  const onClick = (attr, fn) =>
    view.querySelectorAll(`[data-${attr}]`).forEach((b) => b.onclick = () => fn(b.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())]));

  onSubmit('#add-member', async (f) => {
    await act(() => store.addMember(id, f.get('name').trim()));
    view.querySelector('#add-member input')?.focus();
  });

  onSubmit('#add-flight', (f) => {
    if (!embed.parseFlight(f.get('flightNumber'))) return alert('Enter a flight number like "UA 1234".');
    const date = f.get('date');
    let arrDate = '';
    if (f.get('nextDay')) {
      const d = new Date(date + 'T00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
      arrDate = d.toISOString().slice(0, 10);
    }
    act(() => store.addFlight(id, {
      memberId: f.get('memberId'), flightNumber: embed.parseFlight(f.get('flightNumber')).iata, date,
      depAirport: f.get('depAirport').trim().toUpperCase(), depTime: f.get('depTime'),
      arrAirport: f.get('arrAirport').trim().toUpperCase(), arrTime: f.get('arrTime'), arrDate,
    }));
  });

  const lookup = view.querySelector('#lookup-flight');
  if (lookup) lookup.onclick = async () => {
    const form = view.querySelector('#add-flight');
    const p = embed.parseFlight(form.elements.flightNumber.value);
    if (!p || !form.elements.date.value) return alert('Enter the flight number and date first.');
    lookup.textContent = 'Looking up…';
    try {
      const r = await store.lookupFlight(p.iata, form.elements.date.value);
      for (const k of ['depAirport', 'depTime', 'arrAirport', 'arrTime']) form.elements[k].value = r[k] || '';
      form.elements.nextDay.checked = Boolean(r.arrDate);
    } catch (err) { alert(err.message); }
    lookup.textContent = 'Fill in times automatically';
  };

  onSubmit('#add-item', (f) => {
    const ot = f.get('opentable').trim();
    const rid = ot ? embed.openTableRid(ot) : null;
    // An OpenTable link without an ID can't be embedded — keep it as a plain link.
    const bookingUrl = f.get('bookingUrl').trim() || (ot && !rid && /^https?:/.test(ot) ? ot : '');
    if (ot && !rid && !/^https?:/.test(ot)) return alert('That doesn\'t look like an OpenTable link or ID.');
    act(() => store.addItem(id, {
      day: f.get('day'), time: f.get('time'), title: f.get('title').trim(), notes: f.get('notes').trim(),
      place: f.get('place').trim(), opentableRid: rid ?? '', bookingUrl,
    }));
  });

  onSubmit('#add-expense', (f) => {
    const amount = toCents(f.get('amount'));
    const splitIds = f.getAll('split');
    if (amount <= 0) return alert('Enter an amount greater than zero.');
    if (!splitIds.length) return alert('Pick at least one person to split with.');
    act(() => store.addExpense(id, {
      description: f.get('description').trim(), amount, paidBy: f.get('paidBy'), splits: equalShares(amount, splitIds),
    }));
  });

  onClick('del-member', (mid) => act(() => store.removeMember(id, mid)));
  onClick('del-flight', (fid) => act(() => store.removeFlight(id, fid)));
  onClick('del-item', (iid) => act(() => store.removeItem(id, iid)));
  onClick('del-expense', (eid) => act(() => store.removeExpense(id, eid)));

  // Show / hide an embedded partner site.
  onClick('toggle', (slotId) => {
    const slot = view.querySelector('#' + slotId);
    if (!slot.hidden) { slot.hidden = true; slot.innerHTML = ''; return; }
    slot.innerHTML = frame(slot.dataset.src, slot.dataset.title, Number(slot.dataset.height) || 420);
    slot.hidden = false;
  });

  const share = view.querySelector('#share');
  if (share) share.onclick = async () => {
    const link = location.href.split('#')[0] + `#/trip/${id}`;
    try { await navigator.clipboard.writeText(link); share.textContent = 'Link copied'; }
    catch { prompt('Copy this link:', link); }
  };

  const del = view.querySelector('#del-trip');
  if (del) del.onclick = async () => {
    if (!confirm(`Delete "${trip.name}" for everyone? This can't be undone.`)) return;
    try { await store.deleteTrip(id); location.hash = '#/'; } catch (err) { alert(err.message); }
  };
}
