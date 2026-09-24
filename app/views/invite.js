// What someone sees when they open an invite link and haven't joined yet:
// a Partiful-style invite card — "Tim invited you" — then tap your name or
// type it, plus a username (asked once per device) that ties the trip to them.
import { esc, icon, avatarStack, avatar, busy, toast } from '../ui.js';
import * as store from '../store.js';
import { heroHTML, going, organizer, firstName, tripCover } from './common.js';

export function render(root, trip, onJoined) {
  const org = organizer(trip);
  const me = store.username();
  const unclaimed = trip.members.filter((m) => !m.joined);
  const g = going(trip);
  document.title = `You're invited · ${trip.name}`;

  root.innerHTML = `
    <main class="invite" style="--cover:${esc(tripCover(trip))}">
      <div class="invite-card">
        ${heroHTML(trip, { size: 'sm', top: `<span class="chip glass">${icon('sparkle')}You're invited</span>` })}
        <div class="invite-body">
          <div style="display:flex;align-items:center;gap:12px">
            ${org ? avatar(org, 40) : ''}
            <div><div style="font-weight:600">${org ? `${esc(firstName(org.name))} invited you` : 'You\'re invited'}</div>
              <div class="small muted">${g.length ? `${g.map((m) => esc(firstName(m.name))).slice(0, 3).join(', ')}${g.length > 3 ? ` +${g.length - 3}` : ''} ${g.length === 1 ? 'is' : 'are'} going` : 'Be the first to join'}</div></div>
            <span style="margin-left:auto">${avatarStack(g, 4, 28)}</span>
          </div>

          <form id="join" class="stack" style="gap:12px" novalidate>
            ${unclaimed.length ? `
              <h3>Which one are you?</h3>
              <div class="picks" id="claim">
                ${unclaimed.map((m) => `<label><input type="radio" name="claim" value="${m.id}">
                  <span class="pick">${avatar({ name: m.name }, 30)}${esc(m.name)}</span></label>`).join('')}
                <label><input type="radio" name="claim" value="new"><span class="pick">${icon('plus')}I'm not on the list</span></label>
              </div>` : '<h3>What should we call you?</h3>'}
            <input class="input input-xl" name="name" maxlength="80" placeholder="Your name" autocomplete="given-name" ${unclaimed.length ? 'hidden' : ''}>
            ${me ? '' : `<input class="input" name="username" maxlength="31" placeholder="Pick a username" aria-label="Username"
              autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false">`}
            <button class="btn btn-primary btn-lg btn-block">Join trip ${icon('arrow')}</button>
            <p class="hint" style="text-align:center;margin:-2px 0 0">${me
              ? `Joining as <b>@${esc(me)}</b>`
              : 'No account or password. Enter your username on any device to see your trips.'}</p>
          </form>
        </div>
      </div>
    </main>`;

  const form = root.querySelector('#join');
  const nameIn = form.elements.name;
  root.querySelector('#claim')?.addEventListener('change', (e) => {
    nameIn.hidden = e.target.value !== 'new';
    if (!nameIn.hidden) nameIn.focus();
  });

  // Who are they? A pre-added name, or the name they typed.
  const who = () => {
    const pick = form.querySelector('[name=claim]:checked')?.value;
    if (unclaimed.length && !pick) { toast('Tap your name, or "I\'m not on the list"', { error: true }); return null; }
    if (pick && pick !== 'new') return { memberId: pick };
    const name = nameIn.value.trim();
    if (!name) { toast('Enter your name', { error: true }); nameIn.focus(); return null; }
    return { name };
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const w = who(); if (!w) return;
    const userIn = form.elements.username;
    if (userIn && !store.validUsername(userIn.value)) {
      userIn.focus();
      return toast('Pick a username: 3–30 letters or numbers (dots, dashes and underscores are fine)', { error: true });
    }
    let back = false;
    const ok = await busy(e.submitter, async () => {
      if (userIn) {
        await store.setUsername(userIn.value);
        if (store.tokenFor(trip.id)) { back = true; return; } // already on this trip under that username
      }
      await (w.memberId ? store.claimMember(trip.id, w.memberId) : store.joinTrip(trip.id, w.name));
    });
    if (ok) onJoined(back ? 'Welcome back' : "You're in! Welcome to the trip");
  };
}
