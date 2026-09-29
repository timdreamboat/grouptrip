// Usernames instead of sign-in (owner, 2026-09-24), locked with a 6-digit PIN
// and an optional passkey (owner, 2026-09-28). Pick a username + PIN and every
// trip you create or join is tied to it. On another phone or laptop, the
// username + PIN — or Face ID / fingerprint with a passkey — brings them there.
import { esc, icon, sheet, busy, toast, confirmSheet } from '../ui.js';
import * as store from '../store.js';
import * as pk from '../passkey.js';

const DAY = 24 * 3600 * 1000;
const easyPin = (p) => /^(.)\1{5}$/.test(p) || '01234567890'.includes(p) || '09876543210'.includes(p);

// A 6-digit PIN form in `box`: submits by itself once 6 numbers are typed.
// onPin(pin, fail) returns false/undefined to stay; fail(msg) shows an error under the field.
function pinForm(box, { intro, button = 'Continue', extra = '', onPin }) {
  box.innerHTML = `
    <form class="form" novalidate>
      <p class="hint" style="margin:0">${intro}</p>
      <input class="input input-xl pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*"
        maxlength="6" autocomplete="off" aria-label="6-digit PIN" placeholder="••••••">
      <p class="small" data-err role="alert" style="color:var(--bad);margin:-6px 0 0" hidden></p>
      <button class="btn btn-primary btn-lg btn-block">${button} ${icon('arrow')}</button>
      ${extra}
    </form>`;
  const form = box.querySelector('form');
  const input = form.elements.pin;
  const err = form.querySelector('[data-err]');
  const fail = (msg) => { err.textContent = msg; err.hidden = false; input.value = ''; input.focus(); };
  setTimeout(() => input.focus(), 50);
  let running = false;
  const submit = async () => {
    if (running) return;
    const pin = input.value.replace(/\D/g, '');
    if (!store.validPin(pin)) return fail('Your PIN is 6 numbers');
    err.hidden = true;
    running = true;
    try { await busy(form.querySelector('.btn-primary'), () => onPin(pin, fail)); } finally { running = false; }
  };
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    err.hidden = true;
    if (input.value.length === 6) submit();
  });
  form.onsubmit = (e) => { e.preventDefault(); submit(); };
  return form;
}

// New PIN, then the same again. Resolves via onPin(pin) once both match.
function newPin(box, head, { title, intro, extra = '', onPin, onRedraw }) {
  head.textContent = title;
  pinForm(box, {
    intro,
    extra,
    onPin: (pin, fail) => {
      if (easyPin(pin)) return fail('That PIN is easy to guess — try a less obvious one');
      head.textContent = 'Enter it again';
      pinForm(box, {
        intro: 'Type the same 6 numbers to confirm.',
        onPin: async (again) => {
          if (again !== pin) {
            newPin(box, head, { title, intro, extra, onPin, onRedraw });
            onRedraw?.();
            box.querySelector('[data-err]').textContent = "Those didn't match — try again";
            box.querySelector('[data-err]').hidden = false;
            return;
          }
          await onPin(pin);
        },
      });
    },
  });
}

// ---------- passkey offer: at sign-in, and again later ("Not now" is fine) ----------
const PK = 'grouptrip.passkey'; // { username, here, count, at } for this device
function pkState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(PK) || '{}'); } catch { /* ignore */ }
  return s.username === store.username() ? { here: false, count: 0, at: 0, ...s } : { username: store.username(), here: false, count: 0, at: 0 };
}
function pkSave(change) {
  try { localStorage.setItem(PK, JSON.stringify({ ...pkState(), ...change, username: store.username() })); } catch { /* ignore */ }
}
async function shouldOffer({ later }) {
  if (!store.username() || !store.deviceKey()) return false;
  const s = pkState();
  if (s.here || s.count >= 3 || (later && Date.now() - s.at < 3 * DAY)) return false;
  return pk.passkeyOnThisDevice();
}

async function addPasskey(btn) {
  const ok = await busy(btn, async () => {
    try { await pk.createPasskey(store.username(), store.deviceKey()); } catch (err) {
      if (err?.name === 'InvalidStateError') { pkSave({ here: true }); toast('This device already has your passkey'); return false; }
      if (pk.cancelled(err)) return false;
      throw err;
    }
    return true;
  });
  if (ok) { pkSave({ here: true }); toast('Passkey saved — next time just use Face ID or your fingerprint'); }
  return ok;
}

function passkeyOffer(box, head, close) {
  pkSave({ count: pkState().count + 1, at: Date.now() });
  head.textContent = 'Sign in faster next time?';
  box.innerHTML = `
    <div class="stack" style="gap:12px">
      <div style="display:flex;gap:14px;align-items:center">
        <div class="tl-icon" style="flex:none">${icon('lock')}</div>
        <p style="margin:0">Use <b>Face ID</b>, your <b>fingerprint</b> or your phone's passcode instead of typing your PIN.</p>
      </div>
      <p class="hint" style="margin:0">It's called a passkey. Your face or fingerprint never leaves this device.</p>
      <button class="btn btn-primary btn-lg btn-block" data-add>${icon('lock')}Set up passkey</button>
      <button class="btn btn-secondary btn-block" data-later>Not now</button>
    </div>`;
  box.querySelector('[data-later]').onclick = close;
  box.querySelector('[data-add]').onclick = async (e) => { if (await addPasskey(e.currentTarget)) close(); };
}

// Later: My trips asks once every few days, at most 3 times in all.
export async function maybeOfferPasskey() {
  if (!(await shouldOffer({ later: true })) || document.querySelector('dialog[open]')) return;
  sheet({ title: '', body: '<div data-step></div>', onMount(dlg, close) { passkeyOffer(dlg.querySelector('[data-step]'), dlg.querySelector('.sheet-head h2'), close); } });
}

// ---------- the username sheet ----------
// Ask for a username and its PIN (or passkey). Resolves with the username once
// this device has proven it, or null if they close the sheet. `username` skips
// straight to that name's PIN (or to creating one).
export function askUsername({ title = 'Your username', reason = 'Your trips are saved under it. Enter it with your PIN on any phone or laptop to see them there.', username = null } = {}) {
  return new Promise((resolve) => {
    let done = null;
    sheet({
      title,
      body: '<div data-step></div>',
      onMount(dlg, close) {
        const box = dlg.querySelector('[data-step]');
        const head = dlg.querySelector('.sheet-head h2');
        let status = null;
        dlg.addEventListener('close', () => resolve(done));

        const finish = async (proof, { viaPasskey = false } = {}) => {
          const r = await store.signedIn(proof);
          done = proof.username;
          if (viaPasskey) pkSave({ here: true });
          if (r.trips?.length) toast(`Welcome back, @${proof.username} — ${r.trips.length} trip${r.trips.length === 1 ? '' : 's'} found`);
          if (await shouldOffer({ later: false })) passkeyOffer(box, head, close);
          else close();
        };
        const signInWithPasskey = async (btn, name = null) => {
          const r = await busy(btn, async () => {
            try { return await pk.usePasskey(name); } catch (err) { if (pk.cancelled(err)) return false; throw err; }
          });
          if (r?.deviceKey) await finish(r, { viaPasskey: true });
        };

        const nameStep = () => {
          head.textContent = title;
          box.innerHTML = `
            <form class="form" novalidate>
              <p class="hint" style="margin:0">${esc(reason)}</p>
              <input class="input input-xl" name="username" required maxlength="31" placeholder="e.g. tim.d" aria-label="Username"
                autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(username || store.username() || '')}">
              <p class="hint" style="margin:-4px 0 0">Letters and numbers (dots, dashes and underscores are fine).</p>
              <button class="btn btn-primary btn-lg btn-block">Continue ${icon('arrow')}</button>
              ${pk.passkeySupported() ? `<button type="button" class="btn btn-ghost btn-block" data-passkey>${icon('lock')}Sign in with a passkey</button>` : ''}
            </form>`;
          const form = box.querySelector('form');
          const input = form.elements.username;
          setTimeout(() => input.focus(), 50);
          form.querySelector('[data-passkey]')?.addEventListener('click', (e) => signInWithPasskey(e.currentTarget));
          form.onsubmit = async (e) => {
            e.preventDefault();
            if (!store.validUsername(input.value)) { input.focus(); return toast('Usernames are 3–30 letters or numbers (dots, dashes and underscores are fine)', { error: true }); }
            const s = await busy(form.querySelector('.btn-primary'), () => store.usernameStatus(input.value));
            if (s) pinStep(s);
          };
        };

        const wireOther = () => {
          const b = box.querySelector('[data-other]');
          if (b) b.onclick = () => { username = ''; nameStep(); };
        };
        const pinStep = (s) => {
          status = s;
          const who = `<b>@${esc(s.username)}</b>`;
          const other = `<button type="button" class="link-btn" data-other>Not @${esc(s.username)}?</button>`;
          if (s.hasPin) {
            head.textContent = 'Enter your PIN';
            const form = pinForm(box, {
              intro: `The 6-digit PIN for ${who}.`,
              extra: `
                ${s.hasPasskey && pk.passkeySupported() ? `<button type="button" class="btn btn-secondary btn-block" data-passkey>${icon('lock')}Use Face ID or passkey</button>` : ''}
                <div style="display:flex;justify-content:center;gap:12px">
                  <button type="button" class="link-btn" data-forgot>Forgot PIN?</button>${other}
                </div>
                <p class="hint" data-forgot-text hidden style="margin:0">On a phone or laptop where you're still in GroupTripIt, tap
                  your username and choose <b>Change PIN</b>. Or use your passkey. Otherwise, ask a trip's organizer to
                  <b>Let you back in</b> — you'll rejoin with a new username, and your RSVP, flights and expenses stay.</p>`,
              onPin: async (pin, fail) => {
                const r = await store.unlockWithPin(s.username, pin);
                if (!r.ok) return fail(r.error);
                await finish(r);
              },
            });
            form.querySelector('[data-passkey]')?.addEventListener('click', (e) => signInWithPasskey(e.currentTarget, s.username));
            form.querySelector('[data-forgot]').onclick = () => { form.querySelector('[data-forgot-text]').hidden = false; };
          } else {
            newPin(box, head, {
              title: s.taken ? 'Protect your username' : 'Create a PIN',
              intro: `${s.taken ? `Add a 6-digit PIN to ${who} so only you can use it.` : `Pick a 6-digit PIN for ${who}.`}
                You'll enter it when you use GroupTripIt on a new phone or laptop.`,
              extra: `<div style="text-align:center">${other}</div>`,
              onPin: async (pin) => finish(await store.createPin(s.username, pin)),
              onRedraw: wireOther,
            });
          }
          wireOther();
        };

        if (username && store.validUsername(username)) {
          box.innerHTML = '<div class="skeleton" style="height:180px"></div>';
          store.usernameStatus(username).then(pinStep, () => nameStep());
        } else nameStep();
      },
    });
  });
}

// Runs fn; if the server says this device hasn't proven its username yet
// (older devices from before PINs), asks for the PIN and tries once more.
// Resolves false if they close the sheet.
export async function withUnlock(fn) {
  try { return await fn(); } catch (err) {
    if (err.code !== 'PIN_REQUIRED' && err.code !== 'PIN_NEEDED') throw err;
    if (!(await askUsername({ username: store.username() }))) return false;
    return fn();
  }
}

// "You" sheet from the home screen and trip settings: username, PIN, passkeys, switch.
export function openUsername() {
  const u = store.username();
  if (!u) return askUsername();
  const proven = Boolean(store.deviceKey());
  sheet({
    title: 'Your username',
    body: `
      <p style="margin:0 0 6px">You're <b>@${esc(u)}</b></p>
      <p class="hint" style="margin:0 0 14px">Enter it with your PIN on any phone or laptop to see your trips there.</p>
      ${proven ? `
        <h3 style="display:flex;align-items:center;gap:8px;margin:4px 0 6px">${icon('lock')}Passkeys</h3>
        <p class="hint" style="margin:0 0 8px">Sign in with Face ID, your fingerprint or your phone's passcode instead of your PIN.</p>
        <div data-list><p class="hint" style="margin:0 0 8px">Loading…</p></div>
        <div class="stack" style="gap:8px;margin-top:8px">
          ${pk.passkeySupported() ? `<button class="btn btn-secondary btn-block" data-add>${icon('plus')}Add a passkey</button>` : ''}
          <button class="btn btn-secondary btn-block" data-pin>${icon('lock')}Change PIN</button>
        </div>` : `
        <button class="btn btn-primary btn-block" data-unlock>${icon('lock')}Enter your PIN</button>
        <p class="hint" style="margin:6px 0 0">This device hasn't been checked with your PIN yet.</p>`}
      <button class="btn btn-ghost btn-block" data-switch style="margin-top:8px">${icon('logout')}Use a different username</button>`,
    onMount(dlg, close) {
      const list = dlg.querySelector('[data-list]');
      const draw = async () => {
        if (!list) return;
        let keys = [];
        try { keys = await store.myPasskeys(); } catch { list.innerHTML = '<p class="hint" style="margin:0">Couldn\'t load your passkeys.</p>'; return; }
        list.innerHTML = keys.length ? keys.map((k) => `
          <div class="row" style="min-height:48px;padding:6px 0">
            <div class="grow"><div style="font-weight:600">${esc(k.device || 'Passkey')}</div>
              <div class="small muted">Added ${new Date(k.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
            <button class="btn btn-xs btn-ghost" data-remove="${esc(k.id)}">${icon('trash')}Remove</button>
          </div>`).join('') : '<p class="hint" style="margin:0">None yet.</p>';
        list.querySelectorAll('[data-remove]').forEach((b) => b.onclick = async () => {
          if (!(await confirmSheet({ title: 'Remove this passkey?', message: 'You can still sign in with your PIN. To finish, also delete it from your phone\'s saved passwords.', confirm: 'Remove', danger: true }))) return;
          if (await busy(null, () => store.removePasskey(b.dataset.remove))) { pkSave({ here: false }); toast('Passkey removed'); draw(); }
        });
      };
      draw();
      dlg.querySelector('[data-add]')?.addEventListener('click', async (e) => { if (await addPasskey(e.currentTarget)) draw(); });
      dlg.querySelector('[data-pin]')?.addEventListener('click', () => { close(); changePin(); });
      dlg.querySelector('[data-unlock]')?.addEventListener('click', async () => { close(); if (await askUsername({ username: u })) openUsername(); });
      dlg.querySelector('[data-switch]').onclick = async () => {
        close();
        if (!(await confirmSheet({ title: 'Switch username?', message: `Your trips stay under @${u}. Enter it and your PIN any time to get them back.`, confirm: 'Switch' }))) return;
        await import('../pwa.js').then((pwa) => (pwa.pushEnabled() ? pwa.disablePush() : null)).catch(() => {});
        store.forgetUsername();
        location.hash = '#/';
        location.reload();
      };
    },
  });
}

function changePin() {
  sheet({
    title: 'New PIN',
    body: '<div data-step></div>',
    onMount(dlg, close) {
      newPin(dlg.querySelector('[data-step]'), dlg.querySelector('.sheet-head h2'), {
        title: 'New PIN',
        intro: `Pick a new 6-digit PIN for <b>@${esc(store.username())}</b>.`,
        onPin: async (pin) => { await store.changePin(pin); close(); toast('PIN changed'); },
      });
    },
  });
}
