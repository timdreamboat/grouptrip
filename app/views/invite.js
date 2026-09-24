// What someone sees when they open an invite link and haven't joined yet:
// a Partiful-style invite card — "Tim invited you" — then tap your name or
// type it, and join as a guest (name + email, this device only) or with an
// account (email code, Google, Apple or a passkey — works on any device).
import { esc, icon, avatarStack, avatar, busy, toast } from '../ui.js';
import * as store from '../store.js';
import * as auth from '../auth.js';
import { signIn } from './signin.js';
import { heroHTML, going, organizer, firstName, tripCover } from './common.js';

export function render(root, trip, onJoined) {
  const org = organizer(trip);
  const me = auth.user();
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
            ${me ? `
              <button class="btn btn-primary btn-lg btn-block" data-how="account">Join as ${esc(me.email)} ${icon('arrow')}</button>
              <p class="hint" style="text-align:center">You'll be able to add your flight and split costs.</p>` : `
              <input class="input" name="email" type="email" autocomplete="email" placeholder="Your email">
              <button class="btn btn-primary btn-lg btn-block" data-how="guest">Join as a guest ${icon('arrow')}</button>
              <button type="button" class="btn btn-secondary btn-lg btn-block" data-how="account">Join with an account</button>
              <p class="hint" style="text-align:center">Guests just need a name and email, on this device. With an account (email code, Google or a passkey) the trip follows you to any phone or laptop.</p>
              <button type="button" class="btn btn-ghost btn-sm" id="have-account" style="justify-self:center">Already joined? Sign in</button>`}
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
  const join = (w, email) => (w.memberId ? store.claimMember(trip.id, w.memberId, email) : store.joinTrip(trip.id, w.name, email));

  const asGuest = async (btn) => {
    const w = who(); if (!w) return;
    const email = form.elements.email.value.trim();
    if (!email || !form.elements.email.checkValidity()) { form.elements.email.focus(); return toast('Enter your email — no code needed', { error: true }); }
    if (await busy(btn, () => join(w, email))) onJoined("You're in! Welcome to the trip");
  };
  const withAccount = async (btn) => {
    const w = who(); if (!w) return;
    if (!auth.signedIn()) {
      try { sessionStorage.setItem('grouptrip.pending-join', JSON.stringify({ code: trip.id, ...w })); } catch { /* ignore */ }
      if (!(await signIn({ title: 'Join with an account', reason: 'Get a code by email, or use Google or a passkey. New here? This creates your account.' }))) return;
      try { sessionStorage.removeItem('grouptrip.pending-join'); } catch { /* ignore */ }
      if (store.tokenFor(trip.id)) return onJoined('Welcome back'); // already on this trip
    }
    if (await busy(btn, () => join(w))) onJoined("You're in! Welcome to the trip");
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const how = e.submitter?.dataset.how || (me ? 'account' : 'guest');
    return how === 'guest' ? asGuest(e.submitter) : withAccount(e.submitter);
  };
  form.querySelector('button[type=button][data-how=account]')?.addEventListener('click', (e) => withAccount(e.currentTarget));
  root.querySelector('#have-account')?.addEventListener('click', async () => {
    if (!(await signIn())) return;
    if (store.tokenFor(trip.id)) onJoined('Welcome back');
    else render(root, trip, onJoined);
  });
}
