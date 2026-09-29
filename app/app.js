// Router.
//   #/                     your trips (or the landing page)
//   #/new                  create a trip
//   #/t/<code>[/<tab>]     a trip — the invite page until you've joined
//   #/me/<code>/<token>    old private links (before accounts) — just open the trip
import * as store from './store.js';
import { toast, esc, icon } from './ui.js';
import * as home from './views/home.js';
import * as create from './views/create.js';
import * as invite from './views/invite.js';
import * as tripView from './views/trip.js';
import { locate, coverOptions } from './places.js';
import * as pwa from './pwa.js';
import { askForNotifications } from './views/getapp.js';
import { askUsername, maybeOfferPasskey } from './views/username.js';

const root = document.getElementById('app');
let current = { code: null, tab: null, trip: null };

// Smooth cross-fades between screens where the browser supports it.
function paint(fn, { animate = true } = {}) {
  if (animate && document.startViewTransition && document.visibilityState === 'visible'
      && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Draw exactly once: inside the transition, or directly if the browser
    // never gets to it (e.g. the tab isn't being rendered).
    let drawn = false;
    const draw = () => { if (!drawn) { drawn = true; fn(); } };
    const t = document.startViewTransition(draw);
    setTimeout(draw, 400);
    // A newer navigation can interrupt an animation; that's fine.
    t.ready.catch(() => {}); t.finished.catch(() => {}); t.updateCallbackDone.catch(() => {});
  } else fn();
}

async function route() {
  const [page, code, extra] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('dialog.sheet').forEach((d) => d.close());

  if (page === 'me' && code) { location.replace(`#/t/${code}`); return; }
  if (page === 'new') { current = {}; return paint(() => create.render(root)); }
  if (page === 't' && code) return openTrip(code, extra || 'home');
  current = {};
  paint(() => home.render(root));
  refreshTrips();
}

async function openTrip(code, tab, { animate = true, keepScroll = false } = {}) {
  const sameTrip = current.code === code && current.trip;
  if (!sameTrip) root.innerHTML = '<div class="main" style="padding-top:24px"><div class="skeleton" style="height:280px"></div></div>';
  let trip;
  try { trip = await store.getTrip(code); }
  catch (err) {
    root.innerHTML = `<div class="site"><div class="empty" style="padding-top:18vh">
      <div class="empty-icon">${icon('search')}</div><h3>We couldn't open this trip</h3>
      <p>${esc(err.message === 'Trip not found' ? 'The link may be wrong, or the trip was deleted.' : err.message)}</p>
      <a class="btn btn-primary" href="#/">Go to your trips</a></div></div>`;
    return;
  }
  const scroll = window.scrollY;
  current = { code, tab, trip };

  if (!trip.me) {
    return paint(() => invite.render(root, trip, (msg) => {
      try { sessionStorage.setItem('grouptrip.flash', msg); } catch { /* ignore */ }
      openTrip(code, 'home');
    }), { animate });
  }

  const ctx = {
    trip, code, isOrg: trip.me.isOrganizer,
    // Re-read the trip and redraw the same screen (after any change).
    refresh: async (message) => {
      await openTrip(code, current.tab, { animate: false, keepScroll: true });
      if (message) toast(message);
    },
    // Run a change, then refresh; errors become a toast.
    run: async (fn, message) => {
      try { await fn(); } catch (err) { toast(err.message, { error: true }); return; }
      await ctx.refresh(message);
    },
  };
  paint(() => {
    tripView.render(root, ctx, tab);
    window.scrollTo(0, keepScroll ? scroll : 0);
    tripView.flash();
  }, { animate: animate && !keepScroll });
  enrich(ctx);
  if (!followed.has(code) && !trip._offline) { followed.add(code); pwa.followTrip(code); askForNotifications(ctx); }
}
const followed = new Set(); // trips this session made sure get notifications

// Trips made before photos/weather existed: the organizer's device fills in a
// cover photo and map location once, in the background.
const enriched = new Set();
async function enrich({ trip, isOrg, refresh }) {
  if (!isOrg || !trip.destination || enriched.has(trip.id) || (trip.lat != null && trip.cover)) return;
  enriched.add(trip.id);
  const [where, photos] = await Promise.all([
    trip.lat == null ? locate(trip.destination).catch(() => null) : null,
    trip.cover ? [] : coverOptions(trip.destination).catch(() => []),
  ]);
  const change = { ...(where ?? {}), ...(photos[0] ? { cover: photos[0] } : {}) };
  if (!Object.keys(change).length) return;
  try { await store.updateTrip(trip.id, change); } catch { return; }
  if (current.code === trip.id && !document.querySelector('dialog[open]')) refresh();
}

window.addEventListener('hashchange', route);
pwa.registerServiceWorker();

// Refresh the trips list in the background whenever My trips is shown (at most
// every 20 seconds): trips added on another device appear, deleted ones go.
let lastSync = 0;
async function refreshTrips() {
  if (Date.now() - lastSync < 20000) return;
  lastSync = Date.now();
  const before = JSON.stringify(store.listTrips());
  const r = await store.syncMyTrips().catch((err) => ({ err }));
  const onHome = () => !current.code && location.hash.replace(/^#\/?/, '') === '';
  if (onHome() && JSON.stringify(store.listTrips()) !== before) route();
  if (!onHome() || document.querySelector('dialog[open]')) return;
  // Usernames from before PINs get one now; a device that hasn't entered the
  // PIN yet is asked for it (once per visit). Otherwise, maybe offer a passkey.
  const u = store.username();
  if (u && !pinAsked && (r.err?.code === 'PIN_REQUIRED' || r.hasPin === false)) {
    pinAsked = true;
    if (await askUsername({ username: u })) { lastSync = Date.now(); route(); }
  } else if (u && r.hasPin) maybeOfferPasskey();
}
let pinAsked = false;
async function start() {
  route();
  refreshTrips();
}

// Pick up changes friends made while this tab was in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current.code && current.trip?.me && !document.querySelector('dialog[open]')) {
    openTrip(current.code, current.tab, { animate: false, keepScroll: true });
  }
});

start();
