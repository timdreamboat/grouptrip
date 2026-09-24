// People: who's going, their status and flight. Organizers can pre-add
// names (waiting to be claimed from the invite link) and remove people.
import { esc, icon, avatar, fmtDay, fmtTime, copy, share, confirmSheet, busy } from '../ui.js';
import * as store from '../store.js';
import { flightsOf, statusPill, firstName } from './common.js';
import { openMe } from './me.js';

const ORDER = { going: 0, maybe: 1, invited: 2, declined: 3 };

export function render(el, ctx) {
  const { trip, isOrg } = ctx;
  const people = [...trip.members].sort((a, b) =>
    (b.isOrganizer - a.isOrganizer) || (ORDER[a.joined ? a.rsvp : 'invited'] - ORDER[b.joined ? b.rsvp : 'invited']));
  const counts = { going: 0, maybe: 0, declined: 0, invited: 0 };
  for (const m of trip.members) counts[m.joined ? m.rsvp : 'invited']++;

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">People</h1>
        <div class="sub">${counts.going} going${counts.maybe ? ` · ${counts.maybe} maybe` : ''}${counts.invited ? ` · ${counts.invited} not joined yet` : ''}</div></div>
      ${isOrg ? `<button class="btn page-action" data-action="share">${icon('share')}Invite</button>` : ''}
    </header>

    <div class="stack-lg">
      ${isOrg ? `
      <section class="card stack">
        <div><h2>Add people</h2>
          <p class="hint" style="margin-top:4px">Add names now — when they open the invite link they just tap their name.</p></div>
        <form id="add-person" style="display:flex;gap:8px">
          <input class="input" name="name" required maxlength="80" placeholder="Name" autocomplete="off" style="flex:1">
          <button class="btn btn-primary">${icon('plus')}Add</button>
        </form>
        <div class="link-box"><code>${esc(store.inviteLink(trip.id))}</code>
          <button class="btn btn-sm btn-secondary" data-action="copy">${icon('copy')}Copy link</button></div>
      </section>` : ''}

      <section class="card card-tight rows">
        ${people.map((m) => {
          const f = flightsOf(trip, m.id)[0];
          const isMe = trip.me && m.id === trip.me.id;
          return `
          <div class="row">
            ${avatar(m, 44)}
            <div class="grow">
              <div style="display:flex;align-items:center;gap:8px;min-width:0"><span class="title">${esc(m.name)}</span>${statusPill(m, trip)}</div>
              <div class="sub">${f
                ? `${icon('plane', 'tiny')} Lands ${esc(f.arrAirport || '')} ${esc(fmtDay(f.arrDate || f.date, { weekday: 'short' }))}${f.arrTime ? ` ${esc(fmtTime(f.arrTime))}` : ''}`
                : m.joined ? (m.rsvp === 'declined' ? 'Not coming' : 'No flight yet') : 'Waiting for them to open the invite'}</div>
            </div>
            ${isMe ? `<button class="btn btn-xs btn-secondary" data-action="me">Edit</button>` : ''}
            ${isOrg && !m.joined ? `<button class="btn btn-xs btn-secondary" data-nudge="${m.id}">${icon('bell')}Nudge</button>` : ''}
            ${isOrg && m.joined && !m.isOrganizer ? `<button class="btn btn-xs btn-ghost" data-reset="${m.id}" title="Joined with the wrong username? Reset their spot">${icon('link')}Let back in</button>` : ''}
            ${isOrg && !m.isOrganizer ? `<button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${m.id}" aria-label="Remove ${esc(m.name)}">${icon('trash')}</button>` : ''}
          </div>`;
        }).join('')}
      </section>
    </div>`;

  const form = el.querySelector('#add-person');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const ok = await busy(form.querySelector('button'), () => store.inviteMember(trip.id, name));
    if (ok) ctx.refresh(`${firstName(name)} added — share the invite link with them`);
  };

  el.onclick = async (e) => {
    const t = e.target.closest('[data-action],[data-del],[data-nudge],[data-reset]');
    if (!t) return;
    const inviteText = `Join our trip "${trip.name}" on GroupTrip:`;
    if (t.dataset.action === 'share') return share({ title: trip.name, text: inviteText, url: store.inviteLink(trip.id) });
    if (t.dataset.action === 'copy') return copy(store.inviteLink(trip.id), 'Invite link copied');
    if (t.dataset.action === 'me') return openMe(ctx);
    if (t.dataset.reset) {
      const m = trip.members.find((x) => x.id === t.dataset.reset);
      const name = firstName(m.name);
      const ok = await confirmSheet({
        title: `Let ${name} back in?`,
        message: `If ${name} joined with the wrong username (or someone joined as them), this frees their spot. They open the invite link and tap their name again with their own username. Their flights, expenses and votes stay.`,
        confirm: `Reset ${name}'s spot`,
      });
      if (!ok) return;
      const done = await busy(t, () => store.resetMember(trip.id, m.id));
      if (!done) return;
      await ctx.refresh(`${name} can get back in now`);
      const again = await confirmSheet({
        title: `Send ${name} the invite link?`,
        message: `They'll tap "${m.name}" to get back in.`,
        confirm: 'Send link',
      });
      if (again) share({ title: trip.name, text: `Hey ${name}, here's the link to get back into "${trip.name}" — just tap your name:`, url: store.inviteLink(trip.id) });
      return;
    }
    if (t.dataset.nudge) {
      const m = trip.members.find((x) => x.id === t.dataset.nudge);
      return share({ title: trip.name, text: `Hey ${firstName(m.name)}! ${inviteText}`, url: store.inviteLink(trip.id) });
    }
    if (t.dataset.del) {
      const m = trip.members.find((x) => x.id === t.dataset.del);
      const ok = await confirmSheet({ title: `Remove ${m.name}?`, message: 'Their flights go with them. People who are part of an expense can\'t be removed until those expenses are.', confirm: 'Remove', danger: true });
      if (ok) ctx.run(() => store.removeMember(trip.id, m.id), `${firstName(m.name)} removed`);
    }
  };
}
