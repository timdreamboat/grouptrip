// Calendar: one day-by-day timeline of plans, flights and check-ins, plus
// a subscribable feed. Organizers add and remove plans; everyone can open
// the embedded OpenTable booking and maps.
import { esc, icon, fmtDay, fmtTime, tripDays, sheet, embedSheet, confirmSheet, busy, toast, copy, emptyState } from '../ui.js';
import * as store from '../store.js';
import * as embed from '../embeds.js';
import { going, organizer, firstName, nameOf } from './common.js';
import { handleStayClick } from './stays.js';

export function render(el, ctx) {
  const { trip, isOrg } = ctx;
  // One timeline: plans + everyone's flights + check-in/out.
  const entries = [
    ...trip.itinerary.map((it) => ({ day: it.day || '', time: it.time || '', kind: 'plan', it })),
    ...trip.flights.map((f) => ({ day: f.date, time: f.depTime || '', kind: 'flight', f })),
    ...trip.stays.flatMap((s) => [
      s.checkIn && { day: s.checkIn, time: s.checkInTime || '', kind: 'in', s },
      s.checkOut && { day: s.checkOut, time: s.checkOutTime || '', kind: 'out', s },
    ].filter(Boolean)),
  ];
  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.time.localeCompare(b.time));
  const days = [...new Set([...tripDays(trip), ...[...byDay.keys()].filter(Boolean)])].sort();
  const undated = byDay.get('') ?? [];
  const org = organizer(trip);
  const tripDayList = tripDays(trip);

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">Calendar</h1>
        <div class="sub">${entries.length ? `${trip.itinerary.length} plan${trip.itinerary.length === 1 ? '' : 's'} · ${trip.flights.length} flight${trip.flights.length === 1 ? '' : 's'}` : 'Everything, day by day'}</div></div>
      <div style="display:flex;gap:8px">
        ${isOrg ? `<button class="btn btn-secondary btn-sm" data-action="sync">${icon('calplus')}Sync</button>
          <button class="btn page-action" data-action="add">${icon('plus')}Add plan</button>`
        : `<button class="btn page-action" data-action="sync">${icon('calplus')}Add to my calendar</button>`}
      </div>
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

    ${entries.length ? '' : `<div class="card">${isOrg
      ? emptyState('sparkle', 'Start the plan', 'Add dinners, activities, anything. Flights and check-ins show up here automatically.',
          `<button class="btn btn-primary" data-action="add">${icon('plus')}Add the first plan</button>`)
      : emptyState('calendar', 'Nothing planned yet', `${org ? firstName(org.name) : 'The organizer'} hasn't added plans yet. Flights and check-ins will show up here too.`)}</div>`}

    ${days.filter((d) => byDay.has(d)).map((d) => `
      <section class="day" id="day-${d}">
        <div class="day-head"><h3>${esc(fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' }))}</h3>
          ${tripDayList.includes(d) ? `<span class="small muted">Day ${tripDayList.indexOf(d) + 1}</span>` : ''}</div>
        <div class="tl">${byDay.get(d).map((e) => entry(e, ctx)).join('')}</div>
      </section>`).join('')}

    ${undated.length ? `
      <section class="day"><div class="day-head"><h3>Anytime</h3></div>
        <div class="tl">${undated.map((e) => entry(e, ctx)).join('')}</div></section>` : ''}`;

  el.onclick = async (e) => {
    if (await handleStayClick(e, ctx)) return;
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
    if (t.dataset.action === 'sync') return openSync(ctx);
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

function entry(e, ctx) {
  const { trip } = ctx;
  if (e.kind === 'plan') return item(e.it, ctx);
  const time = `<div class="tl-time">${e.time ? esc(fmtTime(e.time)) : ''}</div>`;
  if (e.kind === 'flight') {
    const f = e.f;
    const who = f.memberId === trip.me.id ? 'You' : firstName(nameOf(trip, f.memberId));
    return `<div class="tl-item">${time}
      <a class="card tl-card muted-card" href="#/t/${trip.id}/travel" style="display:flex;gap:12px;align-items:center;text-decoration:none">
        <div class="tl-icon">${icon('plane')}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(who)} · ${esc(f.flightNumber)}</div>
          <div class="small muted">${esc(f.depAirport || '')}${f.depTime ? ` ${esc(fmtTime(f.depTime))}` : ''} → ${esc(f.arrAirport || '')}${f.arrTime ? ` ${esc(fmtTime(f.arrTime))}` : ''}</div></div>
        ${icon('chevron')}
      </a></div>`;
  }
  const s = e.s;
  return `<div class="tl-item">${time}
    <article class="card tl-card muted-card">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="tl-icon">${icon('bed')}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:600">${e.kind === 'in' ? 'Check in' : 'Check out'} · ${esc(s.name)}</div>
          ${s.address ? `<div class="small muted">${esc(s.address)}</div>` : ''}</div>
        ${s.address ? `<button class="btn btn-icon btn-sm btn-secondary" data-stay-map="${s.id}" aria-label="Map">${icon('map')}</button>` : ''}
      </div>
    </article></div>`;
}

// Subscribe in Apple / Google / Outlook — stays in sync as the trip changes.
function openSync({ trip }) {
  const https = store.calendarFeed(trip.id);
  const webcal = https.replace(/^https:/, 'webcal:');
  const options = [
    ['Apple Calendar', 'iPhone, iPad, Mac', webcal],
    ['Google Calendar', 'Android and the web', `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`],
    ['Outlook', 'Outlook.com and Office', `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(trip.name)}`],
  ];
  sheet({
    title: 'Add to your calendar',
    body: `
      <p class="hint" style="margin-bottom:6px">Flights, check-ins and plans show up in your own calendar — and new ones appear automatically.</p>
      <div class="rows">
        ${options.map(([name, sub, href]) => `
          <a class="sync-option" href="${esc(href)}" target="_blank" rel="noopener">
            <div class="tl-icon">${icon('calplus')}</div>
            <div style="flex:1"><div style="font-weight:600">${name}</div><div class="small muted">${sub}</div></div>${icon('external')}
          </a>`).join('')}
      </div>
      <div class="link-box" style="margin-top:12px"><code>${esc(https)}</code>
        <button class="btn btn-sm btn-secondary" data-copy>${icon('copy')}Copy</button></div>
      <p class="hint" style="margin-top:8px">Calendar apps refresh every few hours. Times are local to where things happen.</p>`,
    onMount(dlg) { dlg.querySelector('[data-copy]').onclick = () => copy(https, 'Calendar link copied'); },
  });
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

export function openAddItem(ctx, day, preset = {}) {
  const { trip } = ctx;
  sheet({
    title: 'Add a plan',
    body: `
      <form class="form" id="item-form">
        <label class="field"><span>What's the plan?</span><input name="title" required maxlength="200" placeholder="Dinner at the lake house" value="${esc(preset.title || '')}"></label>
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
