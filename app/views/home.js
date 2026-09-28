// Trips list. First visit: a landing page that explains GroupTrip.
import { esc, icon, coverBg, avatarStack, fmtRange, countdown, sheet, confirmSheet, busy, toast } from '../ui.js';
import * as store from '../store.js';
import { askUsername, openUsername } from './username.js';

export function render(root) {
  document.title = 'GroupTrip';
  const user = store.username();
  const trips = store.listTrips().filter((t) => t.role !== 'invited');
  const sorted = [...trips].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));

  root.innerHTML = `
    <div class="site">
      <header class="site-head">
        <a class="brand" href="#/"><span class="brand-mark">${icon('plane')}</span>GroupTrip</a>
        <div style="display:flex;gap:8px;align-items:center">
          ${trips.length ? `<a class="btn btn-primary btn-sm" href="#/new">${icon('plus')}New trip</a>` : ''}
          ${user ? `<button class="btn btn-secondary btn-sm" data-account aria-label="Your username"><span style="max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">@${esc(user)}</span></button>`
                 : `<button class="btn btn-secondary btn-sm" data-signin>Enter username</button>`}
        </div>
      </header>
      ${!user && trips.length ? `
      <div class="card report-cta" style="margin-top:18px">
        <div class="grow"><div class="title">Pick a username</div>
          <div class="sub">Your trips get saved under it, so you can see them on any device.</div></div>
        <button class="btn btn-primary btn-sm" data-signin>Pick username</button>
      </div>` : ''}

      ${trips.length ? `
        <div class="page-head" style="margin-top:24px"><div><h1 class="display">My trips</h1>
          <div class="sub">${trips.length} trip${trips.length === 1 ? '' : 's'}${user ? '' : ' on this device'}</div></div></div>
        <div class="trip-grid">
          ${sorted.map((t) => {
            const cd = countdown(t);
            return `
            <div class="trip-card-wrap">
            <a class="trip-card" href="#/t/${esc(t.id)}">
              <div class="cover" style="background:${esc(coverBg(t.destination || t.name, t.cover))}">
                <div style="display:flex;gap:6px;flex-wrap:wrap;padding-right:44px">
                  <span class="chip glass">${t.role === 'organizer' ? `${icon('crown')}Organizer` : 'Guest'}${t.kind && t.kind !== 'friends' ? ` · ${t.kind === 'business' ? 'Business' : 'Family'}` : ''}</span>
                  ${cd ? `<span class="chip glass">${esc(cd)}</span>` : ''}
                </div>
                <div class="display">${esc(t.name)}</div>
              </div>
              <div class="info">
                <span class="muted">${esc(t.destination ? `${t.destination} · ` : '')}${esc(fmtRange(t.startDate, t.endDate))}</span>
                ${t.going?.length ? avatarStack(t.going, 3, 24) : ''}
              </div>
            </a>
            <button class="card-menu" data-menu="${esc(t.id)}" aria-label="Options for ${esc(t.name)}">${icon('more')}</button>
            </div>`;
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
              ['users', 'Invite in one tap', 'Share a link. Friends join with a name and a username — no account or password.'],
              ['plane', 'Everyone\'s flights', 'Type a flight number — we fill in the rest.'],
              ['utensils', 'Book together', 'Reserve OpenTable restaurants right in the plan.'],
              ['wallet', 'Split fairly', 'Log costs, settle up with Venmo in one tap.'],
            ].map(([ic, t, d]) => `<div class="feature"><div class="tl-icon">${icon(ic)}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
          </div>
        </section>`}
    </div>`;

  root.querySelectorAll('[data-signin]').forEach((b) => b.onclick = async () => {
    if (await askUsername()) render(root);
  });
  root.querySelectorAll('[data-menu]').forEach((b) => b.onclick = () => tripMenu(trips.find((t) => t.id === b.dataset.menu), root));
  root.querySelector('[data-account]')?.addEventListener('click', openUsername);
}

// The card's "⋯": organizers delete the trip for everyone; guests leave it.
function tripMenu(t, root) {
  if (!t) return;
  const org = t.role === 'organizer';
  sheet({
    title: t.name,
    body: `
      <div class="stack" style="gap:8px">
        <a class="btn btn-secondary btn-block" href="#/t/${esc(t.id)}" data-open>${icon('arrow')}Open trip</a>
        ${org
          ? `<button class="btn btn-danger btn-block" data-delete>${icon('trash')}Delete trip</button>
             <p class="hint" style="margin:0;text-align:center">Removes it for everyone — plans, flights, expenses and photos.</p>`
          : `<button class="btn btn-danger btn-block" data-leave>${icon('logout')}Leave trip</button>
             <p class="hint" style="margin:0;text-align:center">You'll show as "Can't go". Expenses you're part of stay so the money still adds up.</p>`}
      </div>`,
    onMount(dlg, close) {
      dlg.querySelector('[data-open]').addEventListener('click', close);
      dlg.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const ok = await confirmSheet({ title: `Delete "${t.name}"?`, message: "Everyone loses access to this trip. This can't be undone.", confirm: 'Delete for everyone', danger: true });
        if (!ok) return;
        if (await busy(null, () => store.deleteTrip(t.id))) { toast('Trip deleted'); render(root); }
      });
      dlg.querySelector('[data-leave]')?.addEventListener('click', async () => {
        close();
        const ok = await confirmSheet({ title: `Leave "${t.name}"?`, message: 'It comes off your trips. To come back, open the invite link again.', confirm: 'Leave trip', danger: true });
        if (!ok) return;
        if (await busy(null, () => store.leaveTrip(t.id))) { toast('You left the trip'); render(root); }
      });
    },
  });
}
