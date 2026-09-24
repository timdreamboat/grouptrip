// Admin (emails listed in the `admins` table): every trip on GroupTrip, who
// organizes it, who's on it (account or guest) and what's been spent.
import { esc, icon, fmtRange, sheet, busy, emptyState } from '../ui.js';
import { fmt } from '../money.js';
import * as store from '../store.js';
import * as auth from '../auth.js';

export async function render(root) {
  document.title = 'All trips · GroupTrip';
  root.innerHTML = `
    <div class="site">
      <header class="site-head">
        <a class="btn btn-secondary btn-sm" href="#/">${icon('back')}My trips</a>
        <span class="chip">${icon('lock')}Admin</span>
      </header>
      <div class="page-head" style="margin-top:24px"><div><h1 class="display">All trips</h1>
        <div class="sub" id="admin-sub">Loading…</div></div></div>
      <div id="admin-list"><div class="skeleton" style="height:220px"></div></div>
    </div>`;
  const list = root.querySelector('#admin-list');
  const sub = root.querySelector('#admin-sub');
  if (!auth.signedIn()) { sub.textContent = ''; list.innerHTML = `<div class="card">${emptyState('lock', 'Admins only', 'Sign in with an admin account to see every trip.')}</div>`; return; }

  let trips;
  try { trips = await store.adminTrips(); }
  catch (err) { sub.textContent = ''; list.innerHTML = `<div class="card">${emptyState('lock', 'Admins only', err.message)}</div>`; return; }

  const people = trips.reduce((n, t) => n + t.people, 0);
  sub.textContent = `${trips.length} trip${trips.length === 1 ? '' : 's'} · ${people} ${people === 1 ? 'person' : 'people'}`;
  list.innerHTML = trips.length ? `
    <div class="card card-tight rows">
      ${trips.map((t, i) => `
        <button class="row admin-row" data-i="${i}">
          <div class="grow">
            <div class="title">${esc(t.name)} ${t.kind !== 'friends' ? `<span class="pill">${t.kind === 'business' ? 'Business' : 'Family'}</span>` : ''}</div>
            <div class="sub">${esc([t.destination, fmtRange(t.startDate, t.endDate)].filter(Boolean).join(' · '))}</div>
            <div class="sub">${icon('crown', 'tiny')} ${esc(t.organizer || '—')}${t.organizerEmail ? ` · ${esc(t.organizerEmail)}` : ''}</div>
          </div>
          <div style="text-align:right;display:grid;gap:2px;justify-items:end">
            <div class="amt">${fmt(t.spent, t.currency)}</div>
            <div class="sub">${t.people} in${t.guests ? ` · ${t.guests} guest${t.guests === 1 ? '' : 's'}` : ''}</div>
            <div class="sub">made ${esc(new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</div>
          </div>
        </button>`).join('')}
    </div>` : `<div class="card">${emptyState('grid', 'No trips yet', 'Trips show up here as soon as anyone creates one.')}</div>`;

  list.onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (b) openTrip(trips[Number(b.dataset.i)]);
  };
}

function openTrip(t) {
  sheet({
    title: t.name,
    body: `
      <p class="hint" style="margin:0 0 12px">${esc([t.destination, fmtRange(t.startDate, t.endDate)].filter(Boolean).join(' · '))}
        · ${t.expenses} expense${t.expenses === 1 ? '' : 's'}, ${fmt(t.spent, t.currency)}</p>
      <div id="people"><div class="skeleton" style="height:120px"></div></div>
      <a class="btn btn-secondary btn-block" style="margin-top:14px" href="#/t/${esc(t.id)}" data-open>${icon('external')}Open the trip page</a>`,
    async onMount(dlg, close) {
      dlg.querySelector('[data-open]').addEventListener('click', close);
      const box = dlg.querySelector('#people');
      const ok = await busy(null, async () => {
        const people = await store.adminTripPeople(t.id);
        box.innerHTML = `<div class="card card-tight rows" style="box-shadow:none">${people.map((p) => `
          <div class="row">
            <div class="grow"><div class="title">${esc(p.name)}${p.isOrganizer ? ` ${icon('crown', 'tiny')}` : ''}</div>
              <div class="sub">${esc(p.email || 'no email')}</div></div>
            <span class="pill ${p.joined ? (p.account ? 'going' : 'maybe') : 'declined'}">${p.joined ? (p.account ? 'Account' : 'Guest') : 'Not joined'}</span>
          </div>`).join('')}</div>`;
      });
      if (!ok) box.textContent = "Couldn't load people.";
    },
  });
}
