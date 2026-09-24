// Usernames instead of sign-in (owner, 2026-09-24): pick one, and every trip
// you create or join is tied to it. Type it on another phone or laptop and
// your trips are there. No password or code.
import { esc, icon, sheet, busy, toast, confirmSheet } from '../ui.js';
import * as store from '../store.js';

// Ask for a username. Resolves with it once saved, or null if they close the sheet.
export function askUsername({ title = 'Your username', reason = 'Your trips are saved under it. Enter it on any phone or laptop to see them there.' } = {}) {
  return new Promise((resolve) => {
    let done = null;
    sheet({
      title,
      body: `
        <form class="form" id="username-form" novalidate>
          <p class="hint" style="margin:0">${esc(reason)}</p>
          <input class="input input-xl" name="username" required maxlength="31" placeholder="e.g. tim.d" aria-label="Username"
            autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(store.username() || '')}">
          <p class="hint" style="margin:-4px 0 0">Letters and numbers (dots, dashes, underscores are fine). There's no password, so pick something unique to you.</p>
          <button class="btn btn-primary btn-lg btn-block">Continue ${icon('arrow')}</button>
        </form>`,
      onMount(dlg, close) {
        const form = dlg.querySelector('#username-form');
        const input = form.elements.username;
        setTimeout(() => input.focus(), 50);
        form.onsubmit = async (e) => {
          e.preventDefault();
          if (!store.validUsername(input.value)) { input.focus(); return toast('Usernames are 3–30 letters or numbers (dots, dashes and underscores are fine)', { error: true }); }
          const r = await busy(form.querySelector('.btn-primary'), () => store.setUsername(input.value));
          if (!r) return;
          done = r.username;
          if (r.trips.length) toast(`Welcome back, @${r.username} — ${r.trips.length} trip${r.trips.length === 1 ? '' : 's'} found`);
          close();
        };
        dlg.addEventListener('close', () => resolve(done));
      },
    });
  });
}

// "You" sheet from the home screen and trip settings: which username, switch it.
export function openUsername() {
  const u = store.username();
  if (!u) return askUsername();
  sheet({
    title: 'Your username',
    body: `
      <p style="margin:0 0 6px">You're <b>@${esc(u)}</b></p>
      <p class="hint" style="margin:0 0 14px">Enter it on any phone or laptop to see your trips there.</p>
      <button class="btn btn-ghost btn-block" data-switch>${icon('logout')}Use a different username</button>`,
    onMount(dlg, close) {
      dlg.querySelector('[data-switch]').onclick = async () => {
        close();
        if (!(await confirmSheet({ title: 'Switch username?', message: `Your trips stay under @${u}. Enter it again any time to get them back.`, confirm: 'Switch' }))) return;
        await import('../pwa.js').then((pwa) => (pwa.pushEnabled() ? pwa.disablePush() : null)).catch(() => {});
        store.forgetUsername();
        location.hash = '#/';
        location.reload();
      };
    },
  });
}
