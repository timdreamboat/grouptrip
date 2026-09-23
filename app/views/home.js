// Trips list. First visit: a landing page that explains GroupTrip.
import { esc, icon, coverBg, avatarStack, fmtRange, countdown } from '../ui.js';
import * as store from '../store.js';

export function render(root) {
  document.title = 'GroupTrip';
  const trips = store.listTrips().filter((t) => t.role !== 'invited');
  const sorted = [...trips].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));

  root.innerHTML = `
    <div class="site">
      <header class="site-head">
        <a class="brand" href="#/"><span class="brand-mark">${icon('plane')}</span>GroupTrip</a>
        ${trips.length ? `<a class="btn btn-primary btn-sm" href="#/new">${icon('plus')}New trip</a>` : ''}
      </header>

      ${trips.length ? `
        <div class="page-head" style="margin-top:24px"><div><h1 class="display">Your trips</h1>
          <div class="sub">${trips.length} trip${trips.length === 1 ? '' : 's'} on this device</div></div></div>
        <div class="trip-grid">
          ${sorted.map((t) => {
            const cd = countdown(t);
            return `
            <a class="trip-card" href="#/t/${esc(t.id)}">
              <div class="cover" style="background:${esc(coverBg(t.destination || t.name, t.cover))}">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span class="chip glass">${t.role === 'organizer' ? `${icon('crown')}Organizer` : 'Guest'}</span>
                  ${cd ? `<span class="chip glass">${esc(cd)}</span>` : ''}
                </div>
                <div class="display">${esc(t.name)}</div>
              </div>
              <div class="info">
                <span class="muted">${esc(t.destination ? `${t.destination} · ` : '')}${esc(fmtRange(t.startDate, t.endDate))}</span>
                ${t.going?.length ? avatarStack(t.going, 3, 24) : ''}
              </div>
            </a>`;
          }).join('')}
          <a class="new-card" href="#/new"><span class="tl-icon">${icon('plus')}</span>Plan a new trip</a>
        </div>`
      : `
        <section class="landing">
          <span class="chip accent">${icon('sparkle')}Free · no accounts · works on any phone</span>
          <h1 class="display" style="margin-top:18px">Group trips, <em>minus</em> the group chat chaos.</h1>
          <p>One link for the whole crew: who's coming, when everyone lands, the plan, and who owes whom.</p>
          <a class="btn btn-accent btn-lg" href="#/new">Plan a trip ${icon('arrow')}</a>
          <div class="features">
            ${[
              ['users', 'Invite in one tap', 'Share a link. Friends join with just their name.'],
              ['plane', 'Everyone\'s flights', 'Type a flight number — we fill in the rest.'],
              ['utensils', 'Book together', 'Reserve OpenTable restaurants right in the plan.'],
              ['wallet', 'Split fairly', 'Log costs, settle up with Venmo in one tap.'],
            ].map(([ic, t, d]) => `<div class="feature"><div class="tl-icon">${icon(ic)}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
          </div>
        </section>`}
    </div>`;
}
