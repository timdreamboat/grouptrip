// What someone sees when they open an invite link and haven't joined yet:
// a Partiful-style invite card — "Tim invited you" — then tap your name or
// type it to join.
import { esc, icon, avatarStack, avatar, cover, busy, toast } from '../ui.js';
import * as store from '../store.js';
import { heroHTML, going, organizer, firstName } from './common.js';

export function render(root, trip, onJoined) {
  const org = organizer(trip);
  const unclaimed = trip.members.filter((m) => !m.joined);
  const g = going(trip);
  document.title = `You're invited · ${trip.name}`;

  root.innerHTML = `
    <main class="invite" style="--cover:${cover(trip.destination || trip.name)}">
      <div class="invite-card">
        ${heroHTML(trip, { size: 'sm', top: `<span class="chip glass">${icon('sparkle')}You're invited</span>` })}
        <div class="invite-body">
          <div style="display:flex;align-items:center;gap:12px">
            ${org ? avatar(org, 40) : ''}
            <div><div style="font-weight:600">${org ? `${esc(firstName(org.name))} invited you` : 'You\'re invited'}</div>
              <div class="small muted">${g.length ? `${g.map((m) => esc(firstName(m.name))).slice(0, 3).join(', ')}${g.length > 3 ? ` +${g.length - 3}` : ''} ${g.length === 1 ? 'is' : 'are'} going` : 'Be the first to join'}</div></div>
            <span style="margin-left:auto">${avatarStack(g, 4, 28)}</span>
          </div>

          ${unclaimed.length ? `
            <div class="stack" style="gap:10px">
              <h3>Which one are you?</h3>
              <div class="picks" id="claim">
                ${unclaimed.map((m) => `<label><input type="radio" name="claim" value="${m.id}">
                  <span class="pick">${avatar({ name: m.name }, 30)}${esc(m.name)}</span></label>`).join('')}
              </div>
              <button class="btn btn-primary btn-lg btn-block" id="claim-btn" disabled>Join the trip</button>
            </div>
            <div class="divider">or I'm not on the list</div>` : ''}

          <form id="join" class="stack" style="gap:10px">
            ${unclaimed.length ? '' : '<h3>What should we call you?</h3>'}
            <input class="input input-xl" name="name" required maxlength="80" placeholder="Your name" autocomplete="given-name">
            <button class="btn ${unclaimed.length ? 'btn-secondary' : 'btn-primary'} btn-lg btn-block">Join the trip ${icon('arrow')}</button>
          </form>
          <p class="hint" style="text-align:center">No account needed. You'll be able to add your flight and split costs.</p>
        </div>
      </div>
    </main>`;

  const claimBtn = root.querySelector('#claim-btn');
  root.querySelector('#claim')?.addEventListener('change', (e) => {
    const m = unclaimed.find((x) => x.id === e.target.value);
    claimBtn.disabled = false;
    claimBtn.textContent = `Join as ${firstName(m.name)}`;
  });
  claimBtn?.addEventListener('click', async () => {
    const id = root.querySelector('[name=claim]:checked')?.value;
    if (!id) return;
    const ok = await busy(claimBtn, () => store.claimMember(trip.id, id));
    if (ok) onJoined("You're in! Welcome to the trip");
  });

  const form = root.querySelector('#join');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return toast('Enter your name', { error: true });
    const ok = await busy(form.querySelector('button'), () => store.joinTrip(trip.id, name));
    if (ok) onJoined("You're in! Welcome to the trip");
  };
}
