// Install-to-home-screen and phone/desktop notifications.
import * as store from './store.js';
import { PUSH_PUBLIC_KEY } from './config.js';

let deferredInstall = null; // Chrome/Android's install prompt, saved for our button
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { deferredInstall = null; });

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPromptInstall = () => Boolean(deferredInstall);

export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  return outcome === 'accepted';
}

// iPhones only allow web notifications for apps added to the home screen.
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushNeedsInstall = () => isIOS() && !isStandalone();

const PUSH_FLAG = 'grouptrip.push';
export function pushEnabled() {
  try { return pushSupported() && Notification.permission === 'granted' && Boolean(localStorage.getItem(PUSH_FLAG)); }
  catch { return false; }
}

function keyBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// Ask permission once, then follow every trip this device belongs to.
export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser can't show notifications.");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. You can allow them in your browser settings.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) });
  const json = sub.toJSON();
  await Promise.allSettled(store.joinedCodes().map((code) => store.savePush(code, json)));
  try { localStorage.setItem(PUSH_FLAG, json.endpoint); } catch { /* ignore */ }
}

// New trips joined after notifications are on get them too.
export async function followTrip(code) {
  if (!pushEnabled()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await store.savePush(code, sub.toJSON()).catch(() => {});
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await Promise.allSettled(store.joinedCodes().map((code) => store.removePush(code, sub.endpoint)));
    await sub.unsubscribe();
  }
  try { localStorage.removeItem(PUSH_FLAG); } catch { /* ignore */ }
}
