// Router.
//   #/                     your trips (or the landing page)
//   #/new                  create a trip
//   #/t/<code>[/<tab>]     a trip — the invite page until you've joined
//   #/me/<code>/<token>    private "sign in as me" link for another device
import * as store from './store.js';
import { toast, esc, icon } from './ui.js';
import * as home from './views/home.js';
import * as create from './views/create.js';
import * as invite from './views/invite.js';
import * as tripView from './views/trip.js';

const root = document.getElementById('app');
let current = { code: null, tab: null, trip: null };

// Smooth cross-fades between screens where the browser supports it.
function paint(fn, { animate = true } = {}) {
  if (animate && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t = document.startViewTransition(fn);
    // A newer navigation can interrupt an animation; that's fine.
    t.ready.catch(() => {}); t.finished.catch(() => {}); t.updateCallbackDone.catch(() => {});
  } else fn();
}

async function route() {
  const [page, code, extra] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('dialog.sheet').forEach((d) => d.close());

  if (page === 'me' && code && extra) {
    store.saveToken(code, extra);
    location.replace(`#/t/${code}`);
    return;
  }
  if (page === 'new') { current = {}; return paint(() => create.render(root)); }
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
}

window.addEventListener('hashchange', route);

// Pick up changes friends made while this tab was in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current.code && current.trip?.me && !document.querySelector('dialog[open]')) {
    openTrip(current.code, current.tab, { animate: false, keepScroll: true });
  }
});

route();
