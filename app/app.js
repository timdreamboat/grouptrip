// Router.
//   #/                     your trips (or the landing page)
//   #/new                  create a trip
//   #/t/<code>[/<tab>]     a trip — the invite page until you've joined
//   #/admin                every trip (admins only)
//   #/me/<code>/<token>    old private links (before accounts) — just open the trip
import * as store from './store.js';
import * as auth from './auth.js';
import { signIn, afterSignIn } from './views/signin.js';
import * as admin from './views/admin.js';
import { toast, esc, icon } from './ui.js';
import * as home from './views/home.js';
import * as create from './views/create.js';
import * as invite from './views/invite.js';
import * as tripView from './views/trip.js';
import { locate, coverOptions } from './places.js';
import * as pwa from './pwa.js';

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
  if (page === 'new') {
    if (!auth.signedIn() && !(await signIn({ title: 'Sign in to plan a trip', reason: 'Your trip is saved to your account, so only you can manage it — from any device.' }))) {
      if (location.hash === '#/new') location.replace('#/');
      return;
    }
    current = {};
    return paint(() => create.render(root));
  }
  if (page === 'admin') { current = {}; return paint(() => admin.render(root)); }
  if (page === 't' && code) return openTrip(code, extra || 'home');
  current = {};
  paint(() => home.render(root));
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
  if (!followed.has(code) && !trip._offline) { followed.add(code); pwa.followTrip(code); }
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

// "Join with an account" via Google/Apple left the page mid-join: finish joining.
async function finishPendingJoin() {
  let p = null;
  try { p = JSON.parse(sessionStorage.getItem('grouptrip.pending-join')); sessionStorage.removeItem('grouptrip.pending-join'); } catch { /* ignore */ }
  if (!p?.code || store.tokenFor(p.code)) return;
  try {
    await (p.memberId ? store.claimMember(p.code, p.memberId) : store.joinTrip(p.code, p.name));
    sessionStorage.setItem('grouptrip.flash', "You're in! Welcome to the trip");
  } catch (err) { toast(err.message, { error: true }); }
}

// Back from Google/Apple sign-in? Finish it. Signed in already? Refresh my trips list
// from the account in the background (it may have changed on another device).
async function start() {
  try {
    if (await auth.finishRedirect()) {
      await afterSignIn();
      toast(`Signed in as ${auth.user()?.email}`);
      await finishPendingJoin();
    }
  } catch (err) { toast(err.message, { error: true }); }
  route();
  if (auth.signedIn()) {
    const before = JSON.stringify(store.listTrips());
    await store.syncMyTrips().catch(() => {});
    if (!current.code && location.hash.replace(/^#\/?/, '') === '' && JSON.stringify(store.listTrips()) !== before) route();
  }
}

// Pick up changes friends made while this tab was in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current.code && current.trip?.me && !document.querySelector('dialog[open]')) {
    openTrip(current.code, current.tab, { animate: false, keepScroll: true });
  }
});

start();
