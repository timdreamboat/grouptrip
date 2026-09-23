// "You" settings (name, Venmo, RSVP, use on another device) and the
// organizer's trip editor.
import { esc, icon, avatar, sheet, confirmSheet, busy, copy, toast } from '../ui.js';
import * as store from '../store.js';
import { memberById } from './common.js';

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
        <h3 style="display:flex;align-items:center;gap:8px">${icon('link')}Use GroupTrip on another device</h3>
        <p class="hint" style="margin:6px 0 12px">Open this private link on your phone or laptop to be signed in as you. Don't share it — it's yours.</p>
        <button class="btn btn-secondary btn-block" data-personal>${icon('copy')}Copy my private link</button>
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
        }));
        if (ok) { close(); ctx.refresh('Saved'); }
      };
      dlg.querySelector('[data-personal]').onclick = () => copy(store.personalLink(trip.id), 'Private link copied');
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
        <button class="btn btn-primary btn-lg">Save changes</button>
      </form>
      <div style="margin-top:28px;padding-top:18px;border-top:1px solid var(--line)">
        <h3>Delete trip</h3>
        <p class="hint" style="margin:4px 0 12px">Removes the trip, flights, plans and expenses for everyone. This can't be undone.</p>
        <button class="btn btn-danger" data-delete>${icon('trash')}Delete trip</button>
      </div>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#trip-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        if (f.startDate && f.endDate && f.endDate < f.startDate) return toast('The end date is before the start date', { error: true });
        const ok = await busy(form.querySelector('.btn-primary'), () => store.updateTrip(trip.id, f));
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
