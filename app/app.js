import * as store from './store.js';
import { toCents, fmt, equalShares, balances, settleUp } from './money.js';

const view = document.getElementById('view');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (d) => d
  ? new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  : '';

// ---------- routing: #/  |  #/trip/<id>/<tab> ----------
function route() {
  const [, page, id, tab = 'people'] = location.hash.split('/');
  if (page === 'trip' && store.getTrip(id)) renderTrip(store.getTrip(id), tab);
  else renderHome();
}
window.addEventListener('hashchange', route);
route();

// ---------- home ----------
function renderHome() {
  const trips = store.listTrips();
  view.innerHTML = `
    <h1>Your trips</h1>
    <p class="sub">Plan together, split costs, settle up.</p>
    <div class="card">
      ${trips.length ? `<ul class="list">${trips.map((t) => `
        <li><a class="trip" href="#/trip/${t.id}">
          <strong>${esc(t.name)}</strong>
          <div class="meta">${esc(t.destination)}${t.startDate ? ' · ' + fmtDate(t.startDate) : ''}${t.endDate ? ' – ' + fmtDate(t.endDate) : ''} · ${t.members.length} people</div>
        </a></li>`).join('')}</ul>`
      : '<p class="empty">No trips yet — start one below.</p>'}
    </div>
    <div class="card">
      <h2>New trip</h2>
      <form id="new-trip">
        <label>Trip name<input name="name" required placeholder="Lake weekend"></label>
        <label>Destination<input name="destination" placeholder="Lake Tahoe"></label>
        <div class="row">
          <label>Start<input type="date" name="startDate"></label>
          <label>End<input type="date" name="endDate"></label>
          <label>Currency<input name="currency" value="USD" maxlength="3"></label>
        </div>
        <div><button>Create trip</button></div>
      </form>
    </div>`;
  view.querySelector('#new-trip').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.currency = f.currency.trim().toUpperCase() || 'USD';
    const trip = store.createTrip(f);
    location.hash = `#/trip/${trip.id}/people`;
  };
}

// ---------- trip ----------
const TABS = { people: 'People', plan: 'Itinerary', expenses: 'Expenses', settle: 'Settle up' };

function renderTrip(trip, tab) {
  if (!TABS[tab]) tab = 'people';
  const name = (id) => trip.members.find((m) => m.id === id)?.name ?? 'Someone';
  const money = (c) => fmt(c, trip.currency);
  const commit = () => { store.saveTrip(trip); renderTrip(trip, tab); };

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
          <input name="name" required placeholder="Name">
          <div style="flex:0 0 auto"><button>Add person</button></div>
        </form>
      </div>
      <p><button class="ghost" id="del-trip">Delete this trip</button></p>`,

    plan: () => {
      const items = [...trip.itinerary].sort((a, b) =>
        (a.day || '9999').localeCompare(b.day || '9999') || (a.time || '').localeCompare(b.time || ''));
      let lastDay = null;
      return `
      <div class="card">
        ${items.length ? items.map((it) => {
          const header = it.day !== lastDay ? `<div class="day">${it.day ? fmtDate(it.day) : 'Anytime'}</div>` : '';
          lastDay = it.day;
          return `${header}<ul class="list"><li>
            <span>${it.time ? `<span class="meta">${esc(it.time)}</span> ` : ''}<strong>${esc(it.title)}</strong>
            ${it.notes ? `<div class="meta">${esc(it.notes)}</div>` : ''}</span>
            <button class="ghost" data-del-item="${it.id}" title="Remove">✕</button></li></ul>`;
        }).join('') : '<p class="empty">Nothing planned yet.</p>'}
      </div>
      <div class="card">
        <h2>Add to itinerary</h2>
        <form id="add-item">
          <div class="row">
            <label>Day<input type="date" name="day" value="${esc(trip.startDate)}"></label>
            <label>Time<input type="time" name="time"></label>
          </div>
          <label>What<input name="title" required placeholder="Dinner at the pier"></label>
          <label>Notes<input name="notes" placeholder="Reservation under Tim"></label>
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
            <label>What for<input name="description" required placeholder="Groceries"></label>
            <label>Amount<input name="amount" required inputmode="decimal" placeholder="0.00"></label>
          </div>
          <label>Paid by<select name="paidBy">${trip.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
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
          <li><span>${esc(name(p.from))} → ${esc(name(p.to))}</span><span class="amt">${money(p.amount)}</span></li>`).join('')}</ul>`
        : '<p class="empty">Everyone is square.</p>'}
      </div>`;
    },
  }[tab];

  view.innerHTML = `
    <h1>${esc(trip.name)}</h1>
    <p class="sub">${esc(trip.destination)}${trip.startDate ? ' · ' + fmtDate(trip.startDate) : ''}${trip.endDate ? ' – ' + fmtDate(trip.endDate) : ''}</p>
    <nav class="tabs">${Object.entries(TABS).map(([k, label]) =>
      `<a href="#/trip/${trip.id}/${k}" class="${k === tab ? 'on' : ''}">${label}</a>`).join('')}</nav>
    ${body()}`;

  // ----- wire up actions -----
  const on = (sel, fn) => { const el = view.querySelector(sel); if (el) el.onsubmit = (e) => { e.preventDefault(); fn(new FormData(e.target)); }; };

  on('#add-member', (f) => {
    trip.members.push({ id: store.newId(), name: f.get('name').trim() });
    commit();
    view.querySelector('#add-member input')?.focus();
  });
  on('#add-item', (f) => {
    trip.itinerary.push({ id: store.newId(), day: f.get('day'), time: f.get('time'), title: f.get('title').trim(), notes: f.get('notes').trim() });
    commit();
  });
  on('#add-expense', (f) => {
    const amount = toCents(f.get('amount'));
    const splitIds = f.getAll('split');
    if (amount <= 0) return alert('Enter an amount greater than zero.');
    if (!splitIds.length) return alert('Pick at least one person to split with.');
    trip.expenses.unshift({
      id: store.newId(), description: f.get('description').trim(), amount,
      paidBy: f.get('paidBy'), splits: equalShares(amount, splitIds),
      spentOn: new Date().toISOString().slice(0, 10),
    });
    commit();
  });

  view.querySelectorAll('[data-del-member]').forEach((b) => b.onclick = () => {
    const id = b.dataset.delMember;
    const used = trip.expenses.some((e) => e.paidBy === id || e.splits.some((s) => s.memberId === id));
    if (used) return alert(`${name(id)} is part of an expense — remove those expenses first.`);
    trip.members = trip.members.filter((m) => m.id !== id);
    commit();
  });
  view.querySelectorAll('[data-del-item]').forEach((b) => b.onclick = () => {
    trip.itinerary = trip.itinerary.filter((i) => i.id !== b.dataset.delItem);
    commit();
  });
  view.querySelectorAll('[data-del-expense]').forEach((b) => b.onclick = () => {
    trip.expenses = trip.expenses.filter((e) => e.id !== b.dataset.delExpense);
    commit();
  });
  const del = view.querySelector('#del-trip');
  if (del) del.onclick = () => {
    if (confirm(`Delete "${trip.name}"? This can't be undone.`)) { store.deleteTrip(trip.id); location.hash = '#/'; }
  };
}
