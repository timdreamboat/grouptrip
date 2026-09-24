// Sign in or create an account: a passkey, Google, Apple, or a 6-digit code
// sent to any email (new emails get an account automatically). After an email
// sign-in we offer to add a passkey so next time is one tap.
import { esc, icon, sheet, busy, toast, confirmSheet } from '../ui.js';
import * as auth from '../auth.js';
import * as store from '../store.js';
import { SIGN_IN } from '../config.js';

const GOOGLE_G = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
const APPLE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M16.37 12.73c-.02-2.18 1.78-3.23 1.86-3.28-1.02-1.49-2.6-1.69-3.16-1.71-1.34-.14-2.62.79-3.3.79-.68 0-1.73-.77-2.84-.75-1.46.02-2.81.85-3.56 2.16-1.52 2.63-.39 6.52 1.09 8.66.72 1.04 1.58 2.22 2.71 2.18 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.69.7 2.84.68 1.17-.02 1.91-1.06 2.63-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.28-3.48zM14.2 6.33c.6-.73 1-1.74.89-2.75-.86.03-1.9.57-2.52 1.3-.55.64-1.04 1.67-.91 2.66.96.07 1.94-.49 2.54-1.21z"/></svg>`;

// Opens the sign-in sheet. Resolves true once signed in with a passkey or an
// email code. Google/Apple leave the page and come back signed in (app.js).
export function signIn({ title = 'Sign in', reason = 'Use your email, Google or a passkey. New here? This creates your account.' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const others = [
      auth.passkeysSupported() ? `<button class="btn btn-primary btn-lg btn-block" data-passkey>${icon('lock')}Sign in with a passkey</button>` : '',
      SIGN_IN.google ? `<button class="btn btn-secondary btn-lg btn-block brand-btn" data-provider="google">${GOOGLE_G}Continue with Google</button>` : '',
      SIGN_IN.apple ? `<button class="btn btn-secondary btn-lg btn-block brand-btn" data-provider="apple">${APPLE}Continue with Apple</button>` : '',
    ].join('');
    sheet({
      title,
      body: `
        <div class="signin">
          <p class="hint" style="margin:0 0 16px">${esc(reason)}</p>
          <div class="stack" id="quick" style="gap:10px">${others}</div>
          ${others ? '<div class="divider" id="or">or get a code by email</div>' : ''}
          <form class="form" id="email-form">
            <input class="input" name="email" type="email" required autocomplete="email" placeholder="you@example.com">
            <button class="btn ${others ? 'btn-secondary' : 'btn-primary'} btn-lg btn-block">Email me a code</button>
          </form>
          <form class="form" id="code-form" hidden>
            <p class="hint" id="code-sent"></p>
            <input class="input input-xl code-input" name="code" inputmode="numeric" autocomplete="one-time-code" required placeholder="123456" maxlength="10">
            <button class="btn btn-primary btn-lg btn-block">Sign in</button>
            <button type="button" class="btn btn-ghost btn-sm" data-back>Use a different email</button>
          </form>
        </div>`,
      onMount(dlg, close) {
        const emailForm = dlg.querySelector('#email-form');
        const codeForm = dlg.querySelector('#code-form');
        const quick = [dlg.querySelector('#quick'), dlg.querySelector('#or')].filter(Boolean);
        let email = '';
        const finish = () => { done = true; close(); resolve(true); };
        dlg.addEventListener('close', () => { if (!done) resolve(false); }, { once: true });

        dlg.querySelectorAll('[data-provider]').forEach((b) => b.onclick = () => busy(b, () => auth.signInWith(b.dataset.provider)));
        dlg.querySelector('[data-passkey]')?.addEventListener('click', async (e) => {
          const ok = await busy(e.currentTarget, async () => {
            try { await auth.signInWithPasskey(); } catch (err) { if (err.message === 'Cancelled') return false; throw err; }
            await afterSignIn();
            return true;
          });
          if (ok) finish();
        });
        emailForm.onsubmit = async (e) => {
          e.preventDefault();
          email = emailForm.elements.email.value.trim();
          if (!email) return;
          const ok = await busy(emailForm.querySelector('.btn'), () => auth.sendCode(email));
          if (!ok) return;
          emailForm.hidden = true; quick.forEach((x) => { x.hidden = true; });
          codeForm.hidden = false;
          dlg.querySelector('#code-sent').innerHTML = `We sent a code to <b>${esc(email)}</b>. It can take a minute — check spam too.`;
          setTimeout(() => codeForm.elements.code.focus(), 50);
        };
        codeForm.querySelector('[data-back]').onclick = () => {
          codeForm.hidden = true; emailForm.hidden = false; quick.forEach((x) => { x.hidden = false; });
        };
        codeForm.onsubmit = async (e) => {
          e.preventDefault();
          const ok = await busy(codeForm.querySelector('.btn-primary'), async () => {
            await auth.verifyCode(email, codeForm.elements.code.value);
            await afterSignIn();
            return true;
          });
          if (ok) { finish(); offerPasskey(); }
        };
      },
    });
  });
}

// Just signed in: load the account's trips onto this device.
export async function afterSignIn() {
  await store.syncMyTrips().catch(() => {});
}

// After an email sign-in: "Add a passkey?" (once per device, if they have none).
async function offerPasskey() {
  if (!auth.passkeysSupported()) return;
  try { if (localStorage.getItem('grouptrip.passkey-asked')) return; localStorage.setItem('grouptrip.passkey-asked', '1'); } catch { /* ignore */ }
  const existing = await auth.listPasskeys().catch(() => null);
  if (!existing || existing.length) return;
  const yes = await confirmSheet({
    title: 'Skip the code next time?',
    message: 'Add a passkey and sign in with Face ID, Touch ID or your phone\'s screen lock instead of an emailed code.',
    confirm: 'Add a passkey',
  });
  if (yes) addPasskey();
}
export async function addPasskey(btn = null) {
  const ok = await busy(btn, async () => {
    try { await auth.addPasskey(); } catch (err) { if (err.message === 'Cancelled') return false; throw err; }
    return true;
  });
  if (ok) toast('Passkey added — use it to sign in next time');
  return ok;
}

export async function signOut() {
  await import('../pwa.js').then((pwa) => (pwa.pushEnabled() ? pwa.disablePush() : null)).catch(() => {});
  store.forgetAccount();
  await auth.signOut();
  location.hash = '#/';
  location.reload();
}

// Account sheet (home screen and trip settings): who you are, passkeys, admin, sign out.
export function openAccount() {
  const u = auth.user();
  if (!u) return signIn();
  const isAdmin = store.account().isAdmin;
  sheet({
    title: 'Your account',
    body: `
      <p style="margin:0 0 14px">Signed in as <b>${esc(u.email)}</b></p>
      <div class="stack" style="gap:8px">
        ${auth.passkeysSupported() ? `<div class="card" style="box-shadow:none;padding:14px">
          <div style="font-weight:600;display:flex;gap:8px;align-items:center">${icon('lock')}Passkeys</div>
          <p class="hint" id="pk-status" style="margin:4px 0 10px">Checking…</p>
          <button class="btn btn-secondary btn-sm" data-add-pk>${icon('plus')}Add a passkey on this device</button></div>` : ''}
        ${isAdmin ? `<a class="btn btn-secondary btn-block" href="#/admin">${icon('grid')}All trips (admin)</a>` : ''}
        <button class="btn btn-ghost btn-block" data-out>${icon('logout')}Sign out of this device</button>
      </div>`,
    onMount(dlg, close) {
      const status = dlg.querySelector('#pk-status');
      const drawPk = () => auth.listPasskeys().then((list) => {
        status.textContent = list.length
          ? `${list.length} saved: ${list.map((p) => p.friendly_name || 'Passkey').join(', ')}`
          : 'None yet. Add one to sign in with Face ID, Touch ID or your screen lock.';
      }).catch(() => { status.textContent = "Couldn't check your passkeys right now."; });
      if (status) drawPk();
      dlg.querySelector('[data-add-pk]')?.addEventListener('click', async (e) => { if (await addPasskey(e.currentTarget)) drawPk(); });
      dlg.querySelector('a[href="#/admin"]')?.addEventListener('click', close);
      dlg.querySelector('[data-out]').onclick = async () => {
        close();
        if (await confirmSheet({ title: 'Sign out?', message: 'Your trips stay in your account. Sign in again any time to see them.', confirm: 'Sign out' })) signOut();
      };
    },
  });
}
