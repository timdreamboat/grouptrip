// "Get GroupTrip on your phone" (install + notifications) — a dismissible
// card on Home, and the install instructions sheet.
import { icon, sheet, toast, busy } from '../ui.js';
import * as pwa from '../pwa.js';

const DISMISSED = 'grouptrip.appcard.dismissed';
const dismissed = () => { try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; } };

export function appCard() {
  if (dismissed()) return '';
  const installed = pwa.isStandalone();
  const canNotify = pwa.pushSupported() && !pwa.pushNeedsInstall() && !pwa.pushEnabled();
  if (installed && !canNotify) return '';
  return `
  <section class="card app-card">
    <button class="btn btn-icon btn-xs btn-ghost app-card-x" data-app="dismiss" aria-label="Dismiss">${icon('x')}</button>
    <div style="display:flex;gap:14px;align-items:center">
      <img src="icons/icon-192.png" alt="" width="52" height="52" style="border-radius:14px;flex:none">
      <div><h3>${installed ? 'Turn on notifications' : 'Get GroupTrip on your phone'}</h3>
        <p class="hint" style="margin-top:2px">${installed
          ? "Know when there's a new poll, a plan changes, or someone lands."
          : 'One tap from your home screen, works offline, and sends you trip updates.'}</p></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      ${installed ? '' : `<button class="btn btn-primary btn-sm" data-app="install">${icon('plus')}Add to home screen</button>`}
      ${canNotify ? `<button class="btn ${installed ? 'btn-primary' : 'btn-secondary'} btn-sm" data-app="notify">${icon('bell')}Turn on notifications</button>` : ''}
    </div>
  </section>`;
}

export async function handleAppCardClick(e, ctx) {
  const t = e.target.closest('[data-app]');
  if (!t) return false;
  const action = t.dataset.app;
  if (action === 'dismiss') {
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* ignore */ }
    t.closest('.app-card')?.remove();
  } else if (action === 'install') {
    if (pwa.canPromptInstall()) { if (await pwa.promptInstall()) toast('Added — open GroupTrip from your home screen'); }
    else openInstallHelp();
  } else if (action === 'notify') {
    const ok = await busy(t, () => pwa.enablePush());
    if (ok) { toast("Notifications are on for your trips on this device"); ctx.refresh(); }
  }
  return true;
}

export function openInstallHelp() {
  const ios = pwa.isIOS();
  sheet({
    title: 'Add to your home screen',
    body: ios ? `
      <ol class="steps">
        <li>Open this page in <b>Safari</b>.</li>
        <li>Tap the <b>Share</b> button ${icon('share', 'tiny')} at the bottom of the screen.</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open GroupTrip from your home screen and turn on notifications.</li>
      </ol>
      <p class="hint">iPhones only allow notifications for apps on the home screen.</p>` : `
      <ol class="steps">
        <li>Open your browser's menu (⋮ or ⋯).</li>
        <li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
        <li>Open GroupTrip from your home screen or app list.</li>
      </ol>`,
  });
}
