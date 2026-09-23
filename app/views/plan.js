// Itinerary: a day strip + day-by-day timeline. Organizers add and remove
// plans; everyone can open the embedded OpenTable booking and maps.
import { esc, icon, fmtDay, fmtTime, tripDays, sheet, embedSheet, confirmSheet, busy, toast, emptyState } from '../ui.js';
import * as store from '../store.js';
import * as embed from '../embeds.js';
import { going, organizer, firstName } from './common.js';

export function render(el, ctx) {
  const { trip, isOrg } = ctx;
  const byDay = new Map();
  for (const it of trip.itinerary) {
    const k = it.day || '';
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(it);
  }
  const days = [...new Set([...tripDays(trip), ...[...byDay.keys()].filter(Boolean)])].sort();
  const undated = byDay.get('') ?? [];
  const org = organizer(trip);

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">Plan</h1>
        <div class="sub">${trip.itinerary.length ? `${trip.itinerary.length} plan${trip.itinerary.length === 1 ? '' : 's'}` : 'Day by day'}${trip.destination ? ` in ${esc(trip.destination)}` : ''}</div></div>
      ${isOrg ? `<button class="btn page-action" data-action="add">${icon('plus')}Add plan</button>` : ''}
    </header>

    ${days.length ? `<nav class="day-chips" aria-label="Days">${days.map((d) => `
      <a class="day-chip ${byDay.has(d) ? 'has' : ''}" href="#" data-jump="${d}">
        <small>${esc(fmtDay(d, { weekday: 'short' }))}</small><b>${new Date(`${d}T00:00`).getDate()}</b><span class="dot"></span></a>`).join('')}</nav>` : ''}

    ${trip.destination ? `
      <details class="card" style="padding:0;overflow:hidden;margin-bottom:24px">
        <summary style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;list-style:none">
          <div class="tl-icon">${icon('map')}</div><div style="flex:1;font-weight:600">Map of ${esc(trip.destination)}</div>${icon('chevron')}
        </summary>
        <iframe class="map-frame" style="border-radius:0;height:280px" loading="lazy" title="Map of ${esc(trip.destination)}" src="${esc(embed.mapEmbed(trip.destination))}"></iframe>
      </details>` : ''}

    ${trip.itinerary.length ? '' : `<div class="card">${isOrg
      ? emptyState('sparkle', 'Start the plan', 'Add dinners, activities, anything — OpenTable restaurants can be booked right inside the trip.',
          `<button class="btn btn-primary" data-action="add">${icon('plus')}Add the first plan</button>`)
      : emptyState('calendar', 'Nothing planned yet', `${org ? firstName(org.name) : 'The organizer'} hasn't added plans yet. Check back soon.`)}</div>`}

    ${days.filter((d) => byDay.has(d)).map((d, i) => `
      <section class="day" id="day-${d}">
        <div class="day-head"><h3>${esc(fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' }))}</h3>
          ${trip.startDate && days.indexOf(d) >= 0 && d >= trip.startDate ? `<span class="small muted">Day ${tripDays(trip).indexOf(d) + 1 || ''}</span>` : ''}</div>
        <div class="tl">${byDay.get(d).map((it) => item(it, ctx)).join('')}</div>
      </section>`).join('')}

    ${undated.length ? `
      <section class="day"><div class="day-head"><h3>Anytime</h3></div>
        <div class="tl">${undated.map((it) => item(it, ctx)).join('')}</div></section>` : ''}`;

  el.onclick = async (e) => {
    const t = e.target.closest('[data-action],[data-jump],[data-ot],[data-map],[data-del]');
    if (!t) return;
    if (t.dataset.jump) {
      e.preventDefault();
      const target = el.querySelector(`#day-${t.dataset.jump}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (isOrg) openAddItem(ctx, t.dataset.jump);
      else toast('Nothing planned that day yet');
      return;
    }
    if (t.dataset.action === 'add') return openAddItem(ctx);
    const it = trip.itinerary.find((x) => x.id === (t.dataset.ot || t.dataset.map || t.dataset.del));
    if (t.dataset.ot) {
      return embedSheet(`Reserve · ${it.title}`, embed.openTableEmbed(it.opentableRid,
        { covers: Math.max(going(trip).length, 1), day: it.day, time: it.time }));
    }
    if (t.dataset.map) return embedSheet(it.place, embed.mapEmbed(it.place));
    if (t.dataset.del) {
      const ok = await confirmSheet({ title: `Remove "${it.title}"?`, message: 'It will be removed from everyone\'s plan.', confirm: 'Remove', danger: true });
      if (ok) ctx.run(() => store.removeItem(trip.id, it.id), 'Plan removed');
    }
  };
}

function item(it, { isOrg }) {
  const kind = it.opentableRid ? 'ot' : '';
  return `
  <div class="tl-item">
    <div class="tl-time">${it.time ? esc(fmtTime(it.time)) : ''}</div>
    <article class="card tl-card">
      <div class="title-row">
        <div class="tl-icon ${kind}">${icon(it.opentableRid ? 'utensils' : 'calendar')}</div>
        <div class="grow">
          <div style="font-weight:600;font-size:16px">${esc(it.title)}</div>
          ${it.place ? `<div class="place">${icon('pin')}${esc(it.place)}</div>` : ''}
          ${it.notes ? `<div class="small muted" style="margin-top:4px">${esc(it.notes)}</div>` : ''}
        </div>
        ${isOrg ? `<button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${it.id}" aria-label="Remove">${icon('trash')}</button>` : ''}
      </div>
      ${it.opentableRid || it.place || it.bookingUrl ? `<div class="tl-actions">
        ${it.opentableRid ? `<button class="btn btn-sm btn-primary" data-ot="${it.id}">${icon('utensils')}Reserve a table</button>` : ''}
        ${it.place ? `<button class="btn btn-sm btn-secondary" data-map="${it.id}">${icon('map')}Map</button>` : ''}
        ${it.bookingUrl ? `<a class="btn btn-sm btn-outline" href="${esc(it.bookingUrl)}" target="_blank" rel="noopener">Booking ${icon('external')}</a>` : ''}
      </div>` : ''}
    </article>
  </div>`;
}

function openAddItem(ctx, day) {
  const { trip } = ctx;
  sheet({
    title: 'Add a plan',
    body: `
      <form class="form" id="item-form">
        <label class="field"><span>What's the plan?</span><input name="title" required maxlength="200" placeholder="Dinner at the lake house"></label>
        <div class="grid-2">
          <label class="field"><span>Day</span><input type="date" name="day" value="${esc(day || trip.startDate || '')}"></label>
          <label class="field"><span>Time</span><input type="time" name="time"></label>
        </div>
        <label class="field"><span>Place</span><input name="place" placeholder="Name and town, or an address"></label>
        <label class="field"><span>Notes</span><input name="notes" placeholder="Reservation under Tim, dress code…"></label>
        <details class="more">
          <summary>${icon('utensils')} Booking — OpenTable or a link</summary>
          <div class="form">
            <label class="field"><span>OpenTable link or restaurant ID</span>
              <input name="opentable" placeholder="https://www.opentable.com/restref/client/?rid=1779"></label>
            <p class="hint">With an OpenTable ID, everyone can book right inside the trip.
              <a href="${esc(embed.openTableSearch(trip.destination))}" target="_blank" rel="noopener">Search OpenTable ↗</a></p>
            <label class="field"><span>Other booking link</span><input name="bookingUrl" type="url" placeholder="Resy, tour, hotel…"></label>
          </div>
        </details>
      </form>`,
    foot: `<button class="btn btn-primary btn-lg" form="item-form">Add to plan</button>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#item-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        const ot = f.opentable.trim();
        const rid = ot ? embed.openTableRid(ot) : null;
        if (ot && !rid && !/^https?:/.test(ot)) return toast("That doesn't look like an OpenTable link or ID", { error: true });
        // An OpenTable link without an ID can't be embedded — keep it as a plain link.
        const bookingUrl = f.bookingUrl.trim() || (ot && !rid ? ot : '');
        const ok = await busy(dlg.querySelector('.sheet-foot .btn'), () => store.addItem(trip.id, {
          title: f.title.trim(), day: f.day, time: f.time, place: f.place.trim(), notes: f.notes.trim(),
          opentableRid: rid ?? '', bookingUrl,
        }));
        if (ok) { close(); ctx.refresh('Added to the plan'); }
      };
      setTimeout(() => form.elements.title.focus(), 50);
    },
  });
}
