// Sign in or create an account (one screen for both): Google, Apple, or a
// 6-digit code sent to any email; saved passkeys appear in autofill. After an
// email sign-in we offer to add a passkey so next time is one tap.
import { esc, icon, sheet, busy, toast, confirmSheet } from '../ui.js';
import * as auth from '../auth.js';
import * as store from '../store.js';
import { SIGN_IN } from '../config.js';

export const GOOGLE_G = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
export const APPLE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M16.37 12.73c-.02-2.18 1.78-3.23 1.86-3.28-1.02-1.49-2.6-1.69-3.16-1.71-1.34-.14-2.62.79-3.3.79-.68 0-1.73-.77-2.84-.75-1.46.02-2.81.85-3.56 2.16-1.52 2.63-.39 6.52 1.09 8.66.72 1.04 1.58 2.22 2.71 2.18 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.69.7 2.84.68 1.17-.02 1.91-1.06 2.63-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.28-3.48zM14.2 6.33c.6-.73 1-1.74.89-2.75-.86.03-1.9.57-2.52 1.3-.55.64-1.04 1.67-.91 2.66.96.07 1.94-.49 2.54-1.21z"/></svg>`;

// Keep "Email OTP length" at 6 in Supabase (Authentication → Providers → Email).
const CODE_LENGTH = 6;

// Webmail shortcut for the "check your email" step (what Slack, Notion etc. do).
const MAIL = [
  [/@(gmail|googlemail)\.com$/i, 'Open Gmail', 'https://mail.google.com/mail/u/0/#search/GroupTrip'],
  [/@(outlook|hotmail|live|msn)\./i, 'Open Outlook', 'https://outlook.live.com/mail/'],
  [/@(yahoo|ymail)\./i, 'Open Yahoo Mail', 'https://mail.yahoo.com/'],
  [/@(icloud|me|mac)\.com$/i, 'Open iCloud Mail', 'https://www.icloud.com/mail'],
];

// The sign-in / sign-up sheet — one screen for both, like most apps:
// Continue with Google (or Apple), or continue with email → 6-digit code.
// Saved passkeys show up in the email field's autofill. Resolves true once
// signed in; Google/Apple leave the page and come back signed in (app.js).
export function signIn({ title = 'Welcome to GroupTrip', reason = 'Sign in or create an account — it takes a few seconds.' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const last = auth.lastUsed();
    const badge = (m) => (last.method === m ? '<span class="last-used">Last used</span>' : '');
    const providers = [
      SIGN_IN.google ? `<button class="btn btn-secondary btn-lg btn-block brand-btn" data-provider="google">${GOOGLE_G}Continue with Google${badge('google')}</button>` : '',
      SIGN_IN.apple ? `<button class="btn btn-secondary btn-lg btn-block brand-btn" data-provider="apple">${APPLE}Continue with Apple${badge('apple')}</button>` : '',
    ].join('');
    sheet({
      title,
      body: `
        <div class="signin">
          <div id="step-start">
            <p class="hint" style="margin:0 0 16px">${esc(reason)}</p>
            ${providers ? `<div class="stack" style="gap:10px">${providers}</div><div class="divider" style="margin:16px 0">or</div>` : ''}
            <form class="form" id="email-form">
              <input class="input" name="email" type="email" required autocomplete="username webauthn" inputmode="email"
                placeholder="you@example.com" value="${esc(last.email || '')}" aria-label="Email">
              <button class="btn btn-primary btn-lg btn-block">Continue with email${badge('email')}</button>
            </form>
            ${auth.passkeysSupported() ? `<button type="button" class="btn btn-ghost btn-sm signin-link" data-passkey>${icon('lock')}Sign in with a passkey${badge('passkey')}</button>` : ''}
          </div>
          <form class="form" id="code-form" hidden>
            <div style="text-align:center">
              <div class="tl-icon" style="margin:0 auto 10px">${icon('sparkle')}</div>
              <h3 style="margin:0">Check your email</h3>
              <p class="hint" id="code-sent" style="margin:6px 0 0"></p>
            </div>
            <input class="input input-xl code-input" name="code" inputmode="numeric" autocomplete="one-time-code" required
              placeholder="••••••" maxlength="6" aria-label="Code">
            <a class="btn btn-secondary btn-block" id="open-mail" target="_blank" rel="noopener" hidden></a>
            <div class="signin-row">
              <button type="button" class="btn btn-ghost btn-sm" data-back>${icon('back')}Different email</button>
              <button type="button" class="btn btn-ghost btn-sm" data-resend disabled>Resend code</button>
            </div>
          </form>
        </div>`,
      onMount(dlg, close) {
        const start = dlg.querySelector('#step-start');
        const emailForm = dlg.querySelector('#email-form');
        const codeForm = dlg.querySelector('#code-form');
        const codeIn = codeForm.elements.code;
        const resend = codeForm.querySelector('[data-resend]');
        const passkeyAbort = new AbortController();
        let email = '';
        let timer;
        const finish = async (withPasskeyOffer) => {
          await afterSignIn();
          done = true; close(); resolve(true);
          if (withPasskeyOffer) offerPasskey();
        };
        dlg.addEventListener('close', () => { passkeyAbort.abort(); clearInterval(timer); if (!done) resolve(false); }, { once: true });

        dlg.querySelectorAll('[data-provider]').forEach((b) => b.onclick = () => busy(b, () => auth.signInWith(b.dataset.provider)));

        // Passkeys: offered quietly in the email field's autofill; or on request.
        auth.conditionalPasskeysAvailable().then((ok) => {
          if (!ok) return;
          auth.signInWithPasskey({ conditional: true, signal: passkeyAbort.signal }).then(() => finish(false)).catch(() => {});
        });
        dlg.querySelector('[data-passkey]')?.addEventListener('click', async (e) => {
          passkeyAbort.abort();
          const ok = await busy(e.currentTarget, async () => {
            try { await auth.signInWithPasskey(); } catch (err) { if (err.message === 'Cancelled') return false; throw err; }
            return true;
          });
          if (ok) finish(false);
        });

        const cooldown = () => {
          let left = 30;
          resend.disabled = true;
          resend.textContent = `Resend code (${left}s)`;
          clearInterval(timer);
          timer = setInterval(() => {
            left -= 1;
            if (left > 0) { resend.textContent = `Resend code (${left}s)`; return; }
            clearInterval(timer); resend.disabled = false; resend.textContent = 'Resend code';
          }, 1000);
        };
        emailForm.onsubmit = async (e) => {
          e.preventDefault();
          email = emailForm.elements.email.value.trim();
          if (!email || !emailForm.elements.email.checkValidity()) return toast('Enter your email', { error: true });
          const ok = await busy(emailForm.querySelector('.btn'), () => auth.sendCode(email));
          if (!ok) return;
          start.hidden = true; codeForm.hidden = false;
          dlg.querySelector('#code-sent').innerHTML = `We sent a code to <b>${esc(email)}</b>. Enter it below — check spam if it's not there in a minute.`;
          const mail = MAIL.find(([re]) => re.test(email));
          const openMail = dlg.querySelector('#open-mail');
          openMail.hidden = !mail;
          if (mail) { openMail.href = mail[2]; openMail.innerHTML = `${esc(mail[1])} ${icon('external', 'tiny')}`; }
          codeIn.value = '';
          cooldown();
          setTimeout(() => codeIn.focus(), 50);
        };
        resend.onclick = async () => { if (await busy(resend, () => auth.sendCode(email))) { toast('New code sent'); cooldown(); } };
        codeForm.querySelector('[data-back]').onclick = () => { codeForm.hidden = true; start.hidden = false; clearInterval(timer); };

        // Sign in as soon as all 6 digits are there (typed, pasted or autofilled).
        let trying = false;
        const tryCode = async () => {
          const digits = codeIn.value.replace(/\D/g, '');
          if (trying || digits.length !== CODE_LENGTH) return;
          trying = true;
          codeIn.disabled = true;
          try { await auth.verifyCode(email, digits); await finish(true); }
          catch (err) { toast(err.message, { error: true }); codeIn.value = ''; }
          finally { trying = false; codeIn.disabled = false; if (!done) codeIn.focus(); }
        };
        codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.replace(/\D/g, '').slice(0, CODE_LENGTH); tryCode(); });
        codeForm.onsubmit = (e) => { e.preventDefault(); tryCode(); };
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
