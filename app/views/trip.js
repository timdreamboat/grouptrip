// The trip shell: sidebar on desktop, top bar + floating tab bar on phones.
// Renders the active tab into <main>.
import { esc, icon, avatar, cover, fmtRange, toast } from '../ui.js';
import { memberById } from './common.js';
import { openMe } from './me.js';
import * as overview from './overview.js';
import * as plan from './plan.js';
import * as flights from './flights.js';
import * as wallet from './wallet.js';
import * as people from './people.js';

export const TABS = [
  { id: 'home', label: 'Home', icon: 'home', view: overview },
  { id: 'plan', label: 'Plan', icon: 'calendar', view: plan },
  { id: 'flights', label: 'Flights', icon: 'plane', view: flights },
  { id: 'money', label: 'Money', icon: 'wallet', view: wallet },
  { id: 'people', label: 'People', icon: 'users', view: people },
];

export function render(root, ctx, tabId) {
  const { trip, isOrg } = ctx;
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];
  const me = memberById(trip, trip.me.id);
  const counts = { plan: trip.itinerary.length, flights: trip.flights.length, money: trip.expenses.length, people: trip.members.length };
  const href = (t) => `#/t/${trip.id}/${t.id}`;
  document.title = `${tab.id === 'home' ? '' : `${tab.label} · `}${trip.name}`;

  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#/"><span class="brand-mark">${icon('plane')}</span>GroupTrip</a>
        <a class="side-trip" href="${href(TABS[0])}" style="text-decoration:none">
          <span class="thumb" style="background:${cover(trip.destination || trip.name)}"></span>
          <span style="min-width:0"><div class="name">${esc(trip.name)}</div><div class="small muted">${esc(fmtRange(trip.startDate, trip.endDate))}</div></span>
        </a>
        <nav class="side-nav">
          ${TABS.map((t) => `<a href="${href(t)}" class="${t === tab ? 'on' : ''}">${icon(t.icon)}${t.label}${counts[t.id] ? `<span class="count">${counts[t.id]}</span>` : ''}</a>`).join('')}
        </nav>
        <a class="btn btn-ghost btn-sm" href="#/" style="justify-content:flex-start">${icon('back')}All trips</a>
        <button class="side-me" data-me>
          ${avatar(me, 36)}
          <span style="flex:1;min-width:0"><div style="font-weight:600">${esc(me.name)}</div>
            <div class="small muted">${isOrg ? 'Organizer' : 'Guest'}</div></span>
          ${icon('sliders')}
        </button>
      </aside>

      <div>
        <header class="topbar">
          <a class="btn btn-icon btn-ghost" href="#/" aria-label="All trips">${icon('back')}</a>
          <div class="title">${tab.id === 'home' ? '' : esc(trip.name)}</div>
          ${isOrg ? `<span class="pill org">${icon('crown')}Organizer</span>` : ''}
          <button class="btn btn-icon btn-ghost" data-me aria-label="You">${avatar(me, 32)}</button>
        </header>
        <main class="main" id="tab"></main>
      </div>

      <nav class="tabbar" aria-label="Trip sections">
        ${TABS.map((t) => `<a href="${href(t)}" class="${t === tab ? 'on' : ''}" ${t === tab ? 'aria-current="page"' : ''}>${icon(t.icon)}${t.label}</a>`).join('')}
      </nav>
    </div>`;

  root.querySelectorAll('[data-me]').forEach((b) => b.onclick = () => openMe(ctx));
  tab.view.render(root.querySelector('#tab'), ctx);
}

export function flash() {
  try {
    const msg = sessionStorage.getItem('grouptrip.flash');
    if (msg) { sessionStorage.removeItem('grouptrip.flash'); toast(msg); }
  } catch { /* storage unavailable */ }
}
