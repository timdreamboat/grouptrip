// The trip shell: sidebar on desktop, top bar + floating tab bar on phones.
// Renders the active tab into <main>.
import { esc, icon, avatar, fmtRange, toast } from '../ui.js';
import { memberById, tripCover } from './common.js';
import { openMe } from './me.js';
import * as overview from './overview.js';
import * as plan from './plan.js';
import * as flights from './flights.js';
import * as wallet from './wallet.js';
import * as people from './people.js';
import * as lists from './lists.js';
import * as polls from './polls.js';
import * as photos from './photos.js';

// Desktop sidebar shows every tab. Phones show five: the `group` tabs share
// one "Group" button and switch between themselves with a pill row.
export const TABS = [
  { id: 'home', label: 'Home', icon: 'home', view: overview },
  { id: 'plan', label: 'Calendar', icon: 'calendar', view: plan },
  { id: 'travel', label: 'Travel', icon: 'luggage', view: flights },
  { id: 'money', label: 'Money', icon: 'wallet', view: wallet },
  { id: 'polls', label: 'Polls', icon: 'list', view: polls, group: true },
  { id: 'photos', label: 'Photos', icon: 'sparkle', view: photos, group: true },
  { id: 'lists', label: 'Lists', icon: 'check', view: lists, group: true },
  { id: 'people', label: 'People', icon: 'users', view: people, group: true },
];
let lastGroupTab = 'polls';
const ALIASES = { flights: 'travel' };

export function render(root, ctx, tabId) {
  const { trip, isOrg } = ctx;
  const tab = TABS.find((t) => t.id === (ALIASES[tabId] ?? tabId)) ?? TABS[0];
  const me = memberById(trip, trip.me.id);
  const counts = {
    plan: trip.itinerary.length, travel: trip.flights.length + trip.stays.length, money: trip.expenses.length,
    lists: trip.lists.filter((l) => !l.personal && !l.claimedBy).length, people: trip.members.length,
    polls: polls.needsMyVote(trip).length, photos: trip.photos.length,
  };
  if (tab.group) lastGroupTab = tab.id;
  const barTabs = [...TABS.filter((t) => !t.group), { id: lastGroupTab, label: 'Group', icon: 'users', isGroup: true }];
  const barOn = (t) => (t.isGroup ? tab.group : t === tab);
  const href = (t) => `#/t/${trip.id}/${t.id}`;
  document.title = `${tab.id === 'home' ? '' : `${tab.label} · `}${trip.name}`;

  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#/"><span class="brand-mark">${icon('plane')}</span>GroupTrip</a>
        <a class="side-trip" href="${href(TABS[0])}" style="text-decoration:none">
          <span class="thumb" style="background:${esc(tripCover(trip))}"></span>
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
        <main class="main">
          ${tab.group ? `<nav class="seg-nav" aria-label="Group">${TABS.filter((t) => t.group).map((t) =>
            `<a href="${href(t)}" class="${t === tab ? 'on' : ''}">${icon(t.icon)}${t.label}${t.id === 'polls' && counts.polls ? `<span class="badge">${counts.polls}</span>` : ''}</a>`).join('')}</nav>` : ''}
          <div id="tab"></div>
        </main>
      </div>

      <nav class="tabbar" aria-label="Trip sections">
        ${barTabs.map((t) => `<a href="${href(t)}" class="${barOn(t) ? 'on' : ''}" ${barOn(t) ? 'aria-current="page"' : ''}>
          <span class="tab-icon">${icon(t.icon)}${t.isGroup && counts.polls ? '<span class="dot-badge"></span>' : ''}</span>${t.label}</a>`).join('')}
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
