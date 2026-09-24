// What someone sees when they open an invite link and haven't joined yet:
// a Partiful-style invite card — "Tim invited you" — then tap your name or
// type it, and join as a guest (name + email, this device only) or with an
// account (email code, Google, Apple or a passkey — works on any device).
import { esc, icon, avatarStack, avatar, busy, toast } from '../ui.js';
import * as store from '../store.js';
import * as auth from '../auth.js';
import { signIn, GOOGLE_G, APPLE } from './signin.js';
import { SIGN_IN } from '../config.js';
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
              <button class="btn btn-primary btn-lg btn-block" data-how="account">Join trip ${icon('arrow')}</button>
              <p class="hint" style="text-align:center">Signed in as ${esc(me.email)}</p>` : `
              <input class="input" name="email" type="email" autocomplete="email" inputmode="email" placeholder="Your email" value="${esc(auth.lastUsed().email || '')}">
              <button class="btn btn-primary btn-lg btn-block" data-how="guest">Join trip ${icon('arrow')}</button>
              <p class="hint" style="text-align:center;margin:-2px 0 0">No account or password needed.</p>
              <div class="divider">or</div>
              <div class="join-alt">
                ${SIGN_IN.google ? `<button type="button" class="btn btn-secondary btn-lg btn-block brand-btn" data-how="google">${GOOGLE_G}Join with Google</button>` : ''}
                ${SIGN_IN.apple ? `<button type="button" class="btn btn-secondary btn-lg btn-block brand-btn" data-how="apple">${APPLE}Join with Apple</button>` : ''}
                <button type="button" class="btn btn-ghost btn-sm" data-how="account">Have an account? Sign in</button>
              </div>`}
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
  // With an account the name can come from it (Google knows it), so it's optional there.
  const who = ({ nameOptional = false } = {}) => {
    const pick = form.querySelector('[name=claim]:checked')?.value;
    if (unclaimed.length && !pick && !nameOptional) { toast('Tap your name, or "I\'m not on the list"', { error: true }); return null; }
    if (pick && pick !== 'new') return { memberId: pick };
    const name = nameIn.value.trim();
    if (!name && !nameOptional) { toast('Enter your name', { error: true }); nameIn.focus(); return null; }
    return { name };
  };
  const accountName = () => firstName(auth.user()?.name) || (auth.user()?.email || '').split('@')[0];
  const join = (w, email) => (w.memberId ? store.claimMember(trip.id, w.memberId, email)
    : store.joinTrip(trip.id, w.name || accountName(), email));

  const asGuest = async (btn) => {
    const w = who(); if (!w) return;
    const email = form.elements.email.value.trim();
    if (!email || !form.elements.email.checkValidity()) { form.elements.email.focus(); return toast('Enter your email — no code needed', { error: true }); }
    if (await busy(btn, () => join(w, email))) onJoined("You're in! Welcome to the trip");
  };
  // Google/Apple: leave the page; app.js finishes the join when they're back.
  const withProvider = async (btn, provider) => {
    const w = who({ nameOptional: true }); if (!w) return;
    if (!(await auth.ready())[provider]) return toast(auth.NOT_READY[provider], { error: true });
    try { sessionStorage.setItem('grouptrip.pending-join', JSON.stringify({ code: trip.id, ...w })); } catch { /* ignore */ }
    await busy(btn, () => auth.signInWith(provider));
  };
  const withAccount = async (btn) => {
    const w = who({ nameOptional: true }); if (!w) return;
    if (!auth.signedIn()) {
      if (!(await signIn({ title: `Join ${trip.name}`, reason: 'Sign in or create an account, and the trip will be on all your devices.' }))) return;
      if (store.tokenFor(trip.id)) return onJoined('Welcome back'); // already on this trip
    }
    if (await busy(btn, () => join(w))) onJoined("You're in! Welcome to the trip");
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const how = e.submitter?.dataset.how || (me ? 'account' : 'guest');
    return how === 'guest' ? asGuest(e.submitter) : withAccount(e.submitter);
  };
  form.querySelectorAll('button[type=button][data-how]').forEach((b) => b.addEventListener('click', () => (
    b.dataset.how === 'account' ? withAccount(b) : withProvider(b, b.dataset.how))));
}
