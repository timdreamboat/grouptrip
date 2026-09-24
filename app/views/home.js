// Trips list. First visit: a landing page that explains GroupTrip.
import { esc, icon, coverBg, avatarStack, fmtRange, countdown } from '../ui.js';
import * as store from '../store.js';
import * as auth from '../auth.js';
import { signIn, openAccount } from './signin.js';

export function render(root) {
  document.title = 'GroupTrip';
  const user = auth.user();
  const isAdmin = store.account().isAdmin;
  const trips = store.listTrips().filter((t) => t.role !== 'invited');
  const sorted = [...trips].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));

  root.innerHTML = `
    <div class="site">
      <header class="site-head">
        <a class="brand" href="#/"><span class="brand-mark">${icon('plane')}</span>GroupTrip</a>
        <div style="display:flex;gap:8px;align-items:center">
          ${trips.length ? `<a class="btn btn-primary btn-sm" href="#/new">${icon('plus')}New trip</a>` : ''}
          ${user ? `<button class="btn btn-icon btn-secondary btn-sm account-btn" data-account aria-label="Your account">${esc((user.email || '?')[0].toUpperCase())}</button>`
                 : `<button class="btn btn-secondary btn-sm" data-signin>Sign in</button>`}
        </div>
      </header>
      ${!user && trips.length ? `
      <div class="card report-cta" style="margin-top:18px">
        <div class="grow"><div class="title">You joined as a guest</div>
          <div class="sub">Create an account with the same email to see your trips on any device.</div></div>
        <button class="btn btn-primary btn-sm" data-signin>Create account</button>
      </div>` : ''}

      ${trips.length ? `
        <div class="page-head" style="margin-top:24px"><div><h1 class="display">My trips</h1>
          <div class="sub">${trips.length} trip${trips.length === 1 ? '' : 's'}${user ? '' : ' on this device'}</div></div>
          ${isAdmin ? `<a class="btn btn-secondary btn-sm" href="#/admin">${icon('grid')}All trips (admin)</a>` : ''}</div>
        <div class="trip-grid">
          ${sorted.map((t) => {
            const cd = countdown(t);
            return `
            <a class="trip-card" href="#/t/${esc(t.id)}">
              <div class="cover" style="background:${esc(coverBg(t.destination || t.name, t.cover))}">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span class="chip glass">${t.role === 'organizer' ? `${icon('crown')}Organizer` : 'Guest'}${t.kind && t.kind !== 'friends' ? ` · ${t.kind === 'business' ? 'Business' : 'Family'}` : ''}</span>
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
          <span class="chip accent">${icon('sparkle')}Free · friends join without an account · works on any phone</span>
          <h1 class="display" style="margin-top:18px">Group trips, <em>minus</em> the group chat chaos.</h1>
          <p>One link for the whole crew: who's coming, when everyone lands, the plan, and who owes whom.</p>
          <a class="btn btn-accent btn-lg" href="#/new">Plan a trip ${icon('arrow')}</a>
          <div class="features">
            ${[
              ['users', 'Invite in one tap', 'Share a link. Friends join with a name and email — no account needed.'],
              ['plane', 'Everyone\'s flights', 'Type a flight number — we fill in the rest.'],
              ['utensils', 'Book together', 'Reserve OpenTable restaurants right in the plan.'],
              ['wallet', 'Split fairly', 'Log costs, settle up with Venmo in one tap.'],
            ].map(([ic, t, d]) => `<div class="feature"><div class="tl-icon">${icon(ic)}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
          </div>
        </section>`}
    </div>`;

  root.querySelectorAll('[data-signin]').forEach((b) => b.onclick = async () => {
    if (await signIn()) render(root);
  });
  root.querySelector('[data-account]')?.addEventListener('click', openAccount);
}
