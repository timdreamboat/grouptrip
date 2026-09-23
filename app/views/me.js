// "You" settings (name, Venmo, RSVP, use on another device) and the
// organizer's trip editor.
import { esc, icon, avatar, sheet, confirmSheet, busy, copy, toast, suggest } from '../ui.js';
import * as store from '../store.js';
import { memberById, KINDS } from './common.js';
import { locate, suggestDestinations } from '../places.js';
import { mountCoverPicker } from './cover.js';
import * as pwa from '../pwa.js';
import { EMAIL_ENABLED } from '../config.js';
import { openInstallHelp } from './getapp.js';

export function openMe(ctx) {
  const { trip, isOrg } = ctx;
  const me = memberById(trip, trip.me.id);
  sheet({
    title: 'You',
    body: `
      <form class="form" id="me-form">
        <div style="display:flex;align-items:center;gap:14px">
          ${avatar(me, 56)}
          <div><div style="font-weight:600;font-size:18px">${esc(me.name)}</div>
            <div class="small muted">${isOrg ? 'Organizer' : 'Guest'} on ${esc(trip.name)}</div></div>
        </div>
        <label class="field"><span>Your name</span><input name="name" required maxlength="80" value="${esc(me.name)}"></label>
        <label class="field"><span>Venmo username</span><input name="venmo" placeholder="@your-venmo" value="${me.venmo ? `@${esc(me.venmo)}` : ''}" autocomplete="off" autocapitalize="none"></label>
        <p class="hint">With your Venmo, anyone who owes you gets a button that pays you directly.</p>
        ${isOrg ? '' : `
        <div class="field"><span>RSVP</span><div class="segmented">
          ${[['going', 'Going'], ['maybe', 'Maybe'], ['declined', "Can't go"]].map(([v, l]) =>
            `<button type="button" data-rsvp="${v}" class="${me.rsvp === v ? 'on' : ''}">${l}</button>`).join('')}
        </div><input type="hidden" name="rsvp" value="${esc(me.rsvp)}"></div>`}
        <button class="btn btn-primary btn-lg">Save</button>
      </form>

      <div class="card" style="margin-top:22px;box-shadow:none">
        <h3 style="display:flex;align-items:center;gap:8px">${icon('bell')}Notifications</h3>
        <div class="setting">
          <div class="grow"><div style="font-weight:600">On this device</div><div class="small muted" id="push-status"></div></div>
          <span id="push-action"></span>
        </div>
        ${EMAIL_ENABLED ? `<div class="form" style="gap:10px">
          <label class="field"><span>Email</span><input name="email" type="email" form="me-form" autocomplete="email" placeholder="you@example.com"></label>
          <label class="switch"><input type="checkbox" name="emailNotify" form="me-form"><span></span>Email me trip updates too</label>
          <p class="hint">Only you see your email. Tap Save to keep changes.</p>
        </div>` : ''}
      </div>

      <div class="card" style="margin-top:12px;box-shadow:none">
        <h3 style="display:flex;align-items:center;gap:8px">${icon('link')}Use GroupTrip on another device</h3>
        <p class="hint" style="margin:6px 0 12px">Open this private link on your phone or laptop to be signed in as you. Don't share it — it's yours.</p>
        <div style="display:grid;gap:8px">
          ${EMAIL_ENABLED ? `<button class="btn btn-secondary btn-block" data-email-link>${icon('link')}Email me my private link</button>` : ''}
          <button class="btn ${EMAIL_ENABLED ? 'btn-ghost' : 'btn-secondary'} btn-block" data-personal>${icon('copy')}Copy my private link</button>
        </div>
      </div>

      ${isOrg ? `<button class="btn btn-outline btn-block" style="margin-top:12px" data-edit>${icon('pencil')}Edit trip details</button>` : `
      <button class="btn btn-ghost btn-block" style="margin-top:12px" data-leave>${icon('logout')}Remove this trip from this device</button>`}`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#me-form');
      dlg.querySelectorAll('[data-rsvp]').forEach((b) => b.onclick = () => {
        dlg.querySelectorAll('[data-rsvp]').forEach((x) => x.classList.toggle('on', x === b));
        form.elements.rsvp.value = b.dataset.rsvp;
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        const ok = await busy(form.querySelector('.btn-primary'), () => store.updateMe(trip.id, {
          name: f.name.trim(), venmo: f.venmo.trim(), ...(f.rsvp ? { rsvp: f.rsvp } : {}),
          ...(EMAIL_ENABLED ? { email: (f.email || '').trim(), emailNotify: Boolean(f.emailNotify) && Boolean((f.email || '').trim()) } : {}),
        }));
        if (ok) { close(); ctx.refresh('Saved'); }
      };
      dlg.querySelector('[data-personal]').onclick = () => copy(store.personalLink(trip.id), 'Private link copied');

      // Email: fill in what's saved (only you can read it).
      if (EMAIL_ENABLED) wireEmail();
      function wireEmail() {
      const emailIn = dlg.querySelector('[name=email]');
      const notifyIn = dlg.querySelector('[name=emailNotify]');
      let savedEmail = '';
      store.getMe(trip.id).then((mine) => {
        savedEmail = mine?.email || '';
        if (!emailIn.value) emailIn.value = savedEmail;
        notifyIn.checked = Boolean(mine?.emailNotify);
      }).catch(() => {});
      dlg.querySelector('[data-email-link]').onclick = async (e) => {
        const email = emailIn.value.trim();
        if (!email || !emailIn.checkValidity()) { emailIn.focus(); return toast('Add your email above first', { error: true }); }
        const ok = await busy(e.currentTarget, async () => {
          if (email !== savedEmail) { await store.updateMe(trip.id, { email }); savedEmail = email; }
          await store.sendMyLink(trip.id);
        });
        if (ok) toast(`Sent to ${email} — check your inbox`);
      };
      }

      // Notifications on this device.
      const status = dlg.querySelector('#push-status');
      const action = dlg.querySelector('#push-action');
      const drawPush = () => {
        if (pwa.pushNeedsInstall()) {
          status.textContent = 'Add GroupTrip to your home screen first';
          action.innerHTML = '<button class="btn btn-sm btn-secondary">How</button>';
          action.firstChild.onclick = openInstallHelp;
        } else if (!pwa.pushSupported()) {
          status.textContent = "This browser can't show notifications";
          action.innerHTML = '';
        } else if (pwa.pushEnabled()) {
          status.textContent = 'On — polls, plans, expenses and reminders';
          action.innerHTML = '<button class="btn btn-sm btn-ghost">Turn off</button>';
          action.firstChild.onclick = async (ev) => { if (await busy(ev.currentTarget, pwa.disablePush)) drawPush(); };
        } else {
          status.textContent = 'Off';
          action.innerHTML = '<button class="btn btn-sm btn-primary">Turn on</button>';
          action.firstChild.onclick = async (ev) => {
            if (await busy(ev.currentTarget, pwa.enablePush)) { toast('Notifications are on for your trips on this device'); drawPush(); }
          };
        }
      };
      drawPush();
      dlg.querySelector('[data-edit]')?.addEventListener('click', () => { close(); openEditTrip(ctx); });
      dlg.querySelector('[data-leave]')?.addEventListener('click', async () => {
        close();
        const ok = await confirmSheet({
          title: 'Remove from this device?',
          message: "You'll stay on the trip. To get back in here, use your private link.",
          confirm: 'Remove', danger: true,
        });
        if (ok) { store.forgetTrip(trip.id); location.hash = '#/'; }
      });
    },
  });
}

export function openEditTrip(ctx) {
  const { trip } = ctx;
  sheet({
    title: 'Trip details',
    body: `
      <form class="form" id="trip-form">
        <label class="field"><span>Trip name</span><input name="name" required maxlength="120" value="${esc(trip.name)}"></label>
        <label class="field"><span>Destination</span><input name="destination" value="${esc(trip.destination || '')}" placeholder="Lake Tahoe"></label>
        <div class="grid-2">
          <label class="field"><span>Start</span><input type="date" name="startDate" value="${esc(trip.startDate || '')}"></label>
          <label class="field"><span>End</span><input type="date" name="endDate" value="${esc(trip.endDate || '')}"></label>
        </div>
        <div class="field"><span>Kind of trip</span>
          <div class="kind-picks">${Object.entries(KINDS).map(([k, v]) => `
            <label><input type="radio" name="kind" value="${k}" ${(trip.kind || 'friends') === k ? 'checked' : ''}>
              <span class="kind-card"><b>${v.label}</b><small>${v.blurb}</small></span></label>`).join('')}</div></div>
        <div class="field"><span>Cover photo</span><div id="photos"></div></div>
        <button class="btn btn-primary btn-lg">Save changes</button>
      </form>
      <div style="margin-top:28px;padding-top:18px;border-top:1px solid var(--line)">
        <h3>Delete trip</h3>
        <p class="hint" style="margin:4px 0 12px">Removes the trip, flights, plans and expenses for everyone. This can't be undone.</p>
        <button class="btn btn-danger" data-delete>${icon('trash')}Delete trip</button>
      </div>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#trip-form');
      const photos = dlg.querySelector('#photos');
      let cover = trip.cover ?? null;
      let coverFor = trip.destination || '';
      const pick = (dest, first) => {
        coverFor = dest;
        mountCoverPicker(photos, dest, { selected: first ? cover?.url : null, autoPick: !first, onPick: (p) => { cover = p; } });
      };
      if (coverFor) pick(coverFor, true); else photos.innerHTML = '<p class="hint">Add a destination to pick a photo.</p>';
      let picked = null; // { name, lat, lon } from the suggestions
      suggest(form.elements.destination, {
        search: suggestDestinations,
        onPick: (it) => { picked = it; if (it.name !== coverFor) pick(it.name, false); },
      });
      form.elements.destination.addEventListener('change', () => {
        const dest = form.elements.destination.value.trim();
        if (dest && dest !== coverFor) pick(dest, false);
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        if (f.startDate && f.endDate && f.endDate < f.startDate) return toast('The end date is before the start date', { error: true });
        const ok = await busy(form.querySelector('.btn-primary'), async () => {
          const moved = f.destination.trim() !== (trip.destination || '');
          const exact = picked?.name === f.destination.trim() ? { lat: picked.lat, lon: picked.lon } : null;
          const where = moved && f.destination.trim() ? exact ?? await locate(f.destination).catch(() => null) : null;
          return store.updateTrip(trip.id, { ...f, cover: cover ?? { url: '' }, ...(where ?? {}) });
        });
        if (ok) { close(); ctx.refresh('Trip updated'); }
      };
      dlg.querySelector('[data-delete]').onclick = async () => {
        close();
        const ok = await confirmSheet({ title: `Delete "${trip.name}"?`, message: 'Everyone loses access to this trip. This can\'t be undone.', confirm: 'Delete for everyone', danger: true });
        if (!ok) return;
        const done = await busy(null, () => store.deleteTrip(trip.id));
        if (done) { toast('Trip deleted'); location.hash = '#/'; }
      };
    },
  });
}

// Organizer's "Good to know": door codes, Wi-Fi, parking, emergency contacts…
export function openNotes(ctx) {
  const { trip } = ctx;
  sheet({
    title: 'Good to know',
    body: `
      <form class="form" id="notes-form">
        <p class="hint">Everything the group should have handy. Everyone on the trip can see this.</p>
        <label class="field"><span>Notes</span><textarea name="notes" rows="9" maxlength="4000"
          placeholder="Door code: 4821&#10;Wi-Fi: LakeHouse / sunset2026&#10;Parking: two spots in the driveway&#10;Emergency: Tim 555-0100">${esc(trip.notes || '')}</textarea></label>
        <button class="btn btn-primary btn-lg">Save</button>
      </form>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#notes-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const ok = await busy(form.querySelector('.btn-primary'), () => store.updateTrip(trip.id, { notes: form.elements.notes.value }));
        if (ok) { close(); ctx.refresh('Saved'); }
      };
      setTimeout(() => form.elements.notes.focus(), 50);
    },
  });
}
