// Trip home. Organizers get a planning dashboard (invite, readiness, who
// we're waiting on). Guests get "your trip": RSVP, to-dos, balance, next up.
import { esc, icon, avatar, fmtDay, fmtTime, share, copy } from '../ui.js';
import { fmt } from '../money.js';
import * as store from '../store.js';
import { heroHTML, going, flightsOf, organizer, firstName, myBalance, nextUp, memberById } from './common.js';
import { openAddFlight } from './flights.js';
import { openEditTrip, openMe } from './me.js';

export function render(el, ctx) {
  el.innerHTML = ctx.isOrg ? organizerHome(ctx) : guestHome(ctx);
  bind(el, ctx);
}

function nextUpCard({ trip }) {
  const n = nextUp(trip);
  if (!n) return '';
  return `
    <a class="card row-link" href="#/t/${trip.id}/plan" style="display:flex;gap:14px;align-items:center;text-decoration:none">
      <div class="tl-icon ${n.opentableRid ? 'ot' : ''}">${icon(n.opentableRid ? 'utensils' : 'calendar')}</div>
      <div style="flex:1;min-width:0">
        <div class="eyebrow">Next up</div>
        <div style="font-weight:600;font-size:17px">${esc(n.title)}</div>
        <div class="small muted">${esc(fmtDay(n.day))}${n.time ? ` · ${esc(fmtTime(n.time))}` : ''}</div>
      </div>
      ${icon('chevron')}
    </a>`;
}

// ---------- organizer ----------
function organizerHome(ctx) {
  const { trip } = ctx;
  const people = trip.members;
  const joined = people.filter((m) => m.joined);
  const g = going(trip);
  const withFlights = g.filter((m) => flightsOf(trip, m.id).length);
  const steps = [
    { done: Boolean(trip.startDate), title: 'Set the dates', sub: trip.startDate ? 'Dates are set' : 'So everyone can book flights', action: 'edit-trip' },
    { done: joined.length > 1, title: 'Get your crew in', sub: `${joined.length} of ${people.length} joined`, href: 'people' },
    { done: g.length > 0 && withFlights.length === g.length, title: 'Collect flights', sub: `${withFlights.length} of ${g.length} added`, href: 'flights' },
    { done: trip.itinerary.length > 0, title: 'Start the plan', sub: trip.itinerary.length ? `${trip.itinerary.length} plans` : 'Dinners, activities, anything', href: 'plan' },
  ];
  const pct = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);

  const waiting = [
    ...people.filter((m) => !m.joined).map((m) => ({ m, why: "Hasn't joined yet", kind: 'join' })),
    ...g.filter((m) => m.joined && !flightsOf(trip, m.id).length && m.id !== trip.me.id).map((m) => ({ m, why: 'No flight yet', kind: 'flight' })),
  ];
  const spent = trip.expenses.reduce((s, e) => s + e.amount, 0);

  return `
  <div class="stack-lg">
    ${heroHTML(trip, { top: `
      <span class="chip glass">${icon('crown')}You're organizing</span>
      <button class="btn btn-icon btn-sm chip glass" style="width:36px;height:36px;padding:0" data-action="edit-trip" aria-label="Edit trip">${icon('pencil')}</button>` })}

    <section class="card invite-card-org stack">
      <div>
        <h2>Invite your crew</h2>
        <p class="hint" style="margin-top:4px">Anyone with this link can join, add their flight and split costs.</p>
      </div>
      <div class="link-box"><code>${esc(store.inviteLink(trip.id))}</code>
        <button class="btn btn-sm btn-secondary" data-action="copy-invite">${icon('copy')}Copy</button></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-accent" data-action="share-invite">${icon('share')}Share invite</button>
        <a class="btn btn-outline" href="#/t/${trip.id}/people">${icon('users')}Add names</a>
      </div>
    </section>

    <section>
      <div class="section-head"><h2>Trip readiness</h2><span class="sub tabular">${pct}%</span></div>
      <div class="card">
        <div class="progress" style="margin-bottom:6px"><span style="width:${pct}%"></span></div>
        <div class="rows">
          ${steps.map((s) => `
            <${s.href ? `a href="#/t/${trip.id}/${s.href}"` : `button data-action="${s.action}"`} class="row row-link" style="width:100%;background:none;border:0;text-align:left;padding-inline:0;cursor:pointer">
              <span class="check ${s.done ? 'done' : ''}">${icon('check')}</span>
              <span class="grow"><div class="title">${esc(s.title)}</div><div class="sub">${esc(s.sub)}</div></span>
              ${icon('chevron')}
            </${s.href ? 'a' : 'button'}>`).join('')}
        </div>
      </div>
    </section>

    ${waiting.length ? `
    <section>
      <div class="section-head"><h2>Waiting on</h2><span class="sub">${waiting.length}</span></div>
      <div class="card card-tight rows">
        ${waiting.map(({ m, why, kind }) => `
          <div class="row">
            ${avatar(m, 40)}
            <div class="grow"><div class="title">${esc(m.name)}</div><div class="sub">${esc(why)}</div></div>
            <button class="btn btn-sm btn-secondary" data-nudge="${m.id}" data-kind="${kind}">${icon('bell')}Nudge</button>
          </div>`).join('')}
      </div>
    </section>` : ''}

    <section class="stack">
      ${nextUpCard(ctx)}
      <div class="stat-grid">
        <a class="stat" href="#/t/${trip.id}/money" style="text-decoration:none"><div class="num">${fmt(spent, trip.currency)}</div><div class="lbl">Spent so far</div></a>
        <a class="stat" href="#/t/${trip.id}/people" style="text-decoration:none"><div class="num">${g.length}</div><div class="lbl">Going</div></a>
      </div>
    </section>
  </div>`;
}

// ---------- guest ----------
function guestHome(ctx) {
  const { trip } = ctx;
  const me = memberById(trip, trip.me.id);
  const org = organizer(trip);
  const myFlights = flightsOf(trip, me.id);
  const bal = myBalance(trip);
  const todos = [
    { done: myFlights.length > 0, title: 'Add your flight', sub: myFlights.length ? `${myFlights[0].flightNumber} · ${fmtDay(myFlights[0].date)}` : 'So we know when you land', action: 'add-flight', hide: me.rsvp === 'declined' },
    { done: Boolean(me.venmo), title: 'Add your Venmo', sub: me.venmo ? `@${me.venmo}` : 'So friends can pay you back in one tap', action: 'me' },
    ...(bal < 0 ? [{ done: false, title: 'Settle up', sub: `You owe ${fmt(-bal, trip.currency)}`, href: 'money' }] : []),
  ].filter((t) => !t.hide);
  const left = todos.filter((t) => !t.done).length;

  const arrivals = trip.flights
    .map((f) => ({ f, key: `${f.arrDate || f.date}T${f.arrTime || '99:99'}` }))
    .sort((a, b) => a.key.localeCompare(b.key)).slice(0, 4);

  return `
  <div class="stack-lg">
    ${heroHTML(trip, { top: org ? `<span class="chip glass">${avatar(org, 20)}Organized by ${esc(firstName(org.name))}</span>` : '' })}

    <section class="card stack">
      <div><h2>Are you going?</h2></div>
      <div class="segmented" role="group" aria-label="RSVP">
        ${[['going', 'Going'], ['maybe', 'Maybe'], ['declined', "Can't go"]].map(([v, l]) =>
          `<button data-rsvp="${v}" class="${me.rsvp === v ? 'on' : ''}" aria-pressed="${me.rsvp === v}">${l}</button>`).join('')}
      </div>
    </section>

    <section>
      <div class="section-head"><h2>Your to-dos</h2><span class="sub">${left ? `${left} left` : 'All set'}</span></div>
      <div class="card card-tight rows">
        ${todos.map((t) => `
          <${t.href ? `a href="#/t/${trip.id}/${t.href}"` : `button data-action="${t.action || ''}"`} class="row row-link" style="width:100%;background:none;border:0;text-align:left;cursor:${t.done && !t.action ? 'default' : 'pointer'}">
            <span class="check ${t.done ? 'done' : ''}">${icon('check')}</span>
            <span class="grow"><div class="title">${esc(t.title)}</div><div class="sub">${esc(t.sub)}</div></span>
            ${t.done && !t.action ? '' : icon('chevron')}
          </${t.href ? 'a' : 'button'}>`).join('')}
      </div>
    </section>

    <section class="stack">
      ${nextUpCard(ctx)}
      <div class="stat-grid">
        <a class="stat" href="#/t/${trip.id}/money" style="text-decoration:none">
          <div class="num ${bal > 0 ? 'amt pos' : bal < 0 ? 'amt neg' : ''}">${fmt(Math.abs(bal), trip.currency)}</div>
          <div class="lbl">${bal > 0 ? "You're owed" : bal < 0 ? 'You owe' : 'All square'}</div></a>
        <a class="stat" href="#/t/${trip.id}/people" style="text-decoration:none"><div class="num">${going(trip).length}</div><div class="lbl">Going</div></a>
      </div>
    </section>

    ${arrivals.length ? `
    <section>
      <div class="section-head"><h2>Arrivals</h2><a class="btn btn-xs btn-ghost" href="#/t/${trip.id}/flights">See all</a></div>
      <div class="card card-tight rows">
        ${arrivals.map(({ f }) => {
          const m = memberById(trip, f.memberId);
          return `<div class="row">${avatar(m, 36)}
            <div class="grow"><div class="title">${esc(m?.id === me.id ? 'You' : m?.name)}</div>
            <div class="sub">${esc(f.arrAirport || '')} ${f.arrTime ? `· ${esc(fmtTime(f.arrTime))}` : ''}</div></div>
            <span class="small muted">${esc(fmtDay(f.arrDate || f.date))}</span></div>`;
        }).join('')}
      </div>
    </section>` : ''}
  </div>`;
}

function bind(el, ctx) {
  const { trip } = ctx;
  el.onclick = async (e) => {
    const t = e.target.closest('[data-action],[data-rsvp],[data-nudge]');
    if (!t) return;
    if (t.dataset.rsvp) {
      const rsvp = t.dataset.rsvp;
      el.querySelectorAll('[data-rsvp]').forEach((b) => b.classList.toggle('on', b === t));
      await ctx.run(() => store.updateMe(trip.id, { rsvp }), rsvp === 'going' ? "You're going!" : 'RSVP updated');
      return;
    }
    if (t.dataset.nudge) {
      const m = memberById(trip, t.dataset.nudge);
      const text = t.dataset.kind === 'join'
        ? `Hey ${firstName(m.name)}! Join our trip "${trip.name}" on GroupTrip:`
        : `Hey ${firstName(m.name)}, can you add your flight for "${trip.name}"?`;
      share({ title: trip.name, text, url: store.inviteLink(trip.id) });
      return;
    }
    switch (t.dataset.action) {
      case 'copy-invite': copy(store.inviteLink(trip.id), 'Invite link copied'); break;
      case 'share-invite': share({ title: trip.name, text: `Join our trip "${trip.name}" on GroupTrip:`, url: store.inviteLink(trip.id) }); break;
      case 'edit-trip': openEditTrip(ctx); break;
      case 'add-flight': openAddFlight(ctx); break;
      case 'me': openMe(ctx); break;
    }
  };
}
