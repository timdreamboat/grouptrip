// Calendar: one day-by-day timeline of plans, flights and check-ins, plus
// a subscribable feed. Organizers add and remove plans; everyone can open
// the embedded OpenTable booking and maps.
import { esc, icon, fmtDay, fmtTime, tripDays, sheet, embedSheet, confirmSheet, busy, toast, copy, emptyState } from '../ui.js';
import * as store from '../store.js';
import * as embed from '../embeds.js';
import { going, organizer, firstName, nameOf } from './common.js';
import { handleStayClick } from './stays.js';
import { mountTripMap, focusPin, pinned, staysOnMap, stayQuery, hasGoogleKey, googleFindPlace, placeQuery } from './tripmap.js';

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

    ${mapCard(trip)}

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

  const mapEl = el.querySelector('#trip-map');
  if (mapEl) mountTripMap(mapEl, el.querySelector('#map-detail'), trip);
  if (isOrg && hasGoogleKey) pinOlderPlans(ctx);

  el.onclick = async (e) => {
    // Check-in/out "Map" jumps to the hotel's pin on the map above.
    const stayMap = e.target.closest('[data-stay-map]');
    if (stayMap && focusPin(stayMap.dataset.stayMap)) {
      return el.querySelector('#trip-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (await handleStayClick(e, ctx)) return;
    const t = e.target.closest('[data-action],[data-jump],[data-ot],[data-map],[data-del],[data-edit]');
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
    const it = trip.itinerary.find((x) => x.id === (t.dataset.ot || t.dataset.map || t.dataset.del || t.dataset.edit));
    if (t.dataset.edit) return openAddItem(ctx, null, { item: it });
    if (t.dataset.ot) {
      return embedSheet(`Reserve · ${it.title}`, embed.openTableEmbed(it.opentableRid,
        { covers: Math.max(going(trip).length, 1), day: it.day, time: it.time }));
    }
    if (t.dataset.map) {
      if (focusPin(it.id)) return el.querySelector('#trip-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return embedSheet(it.place, embed.mapEmbed(placeQuery(it, trip)));
    }
    if (t.dataset.del) {
      const ok = await confirmSheet({ title: `Remove "${it.title}"?`, message: 'It will be removed from everyone\'s plan.', confirm: 'Remove', danger: true });
      if (ok) ctx.run(() => store.removeItem(trip.id, it.id), 'Plan removed');
    }
  };
}

function entry(e, ctx) {
  const { trip } = ctx;
  if (e.kind === 'plan') return item(e.it, ctx, pinned(trip).findIndex((p) => p.id === e.it.id) + 1);
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

function item(it, { isOrg }, pinNo = 0) {
  const kind = pinNo ? 'numbered' : it.opentableRid ? 'ot' : '';
  return `
  <div class="tl-item">
    <div class="tl-time">${it.time ? esc(fmtTime(it.time)) : ''}</div>
    <article class="card tl-card">
      <div class="title-row">
        <div class="tl-icon ${kind}" ${pinNo ? `title="Pin ${pinNo} on the map"` : ''}>${pinNo || icon(it.opentableRid ? 'utensils' : 'calendar')}</div>
        <div class="grow">
          <div style="font-weight:600;font-size:16px">${esc(it.title)}</div>
          ${it.place ? `<div class="place">${icon('pin')}${esc(it.place)}</div>` : ''}
          ${it.notes ? `<div class="small muted" style="margin-top:4px">${esc(it.notes)}</div>` : ''}
        </div>
        ${isOrg ? `<button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-edit="${it.id}" aria-label="Edit">${icon('pencil')}</button>
          <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${it.id}" aria-label="Remove">${icon('trash')}</button>` : ''}
      </div>
      ${it.opentableRid || it.place || it.bookingUrl ? `<div class="tl-actions">
        ${it.opentableRid ? `<button class="btn btn-sm btn-primary" data-ot="${it.id}">${icon('utensils')}Reserve a table</button>` : ''}
        ${it.place ? `<button class="btn btn-sm btn-secondary" data-map="${it.id}">${icon('map')}Map</button>` : ''}
        ${it.bookingUrl ? `<a class="btn btn-sm btn-outline" href="${esc(it.bookingUrl)}" target="_blank" rel="noopener">Booking ${icon('external')}</a>` : ''}
      </div>` : ''}
    </article>
  </div>`;
}

// Add a plan, or edit one (preset.item). preset.title pre-fills a new plan.
export function openAddItem(ctx, day, preset = {}) {
  const { trip } = ctx;
  const it = preset.item;
  const v = (k) => esc(it?.[k] ?? '');
  sheet({
    title: it ? 'Edit plan' : 'Add a plan',
    body: `
      <form class="form" id="item-form">
        <label class="field"><span>What's the plan?</span><input name="title" required maxlength="200" placeholder="Dinner at the lake house" value="${esc(it?.title ?? preset.title ?? '')}"></label>
        <div class="grid-2">
          <label class="field"><span>Day</span><input type="date" name="day" value="${it ? v('day') : esc(day || trip.startDate || '')}"></label>
          <label class="field"><span>Time</span><input type="time" name="time" value="${v('time')}"></label>
        </div>
        <label class="field"><span>Place</span><input name="place" placeholder="Restaurant, park, or an address" autocomplete="off" value="${v('place')}"></label>
        <div class="place-status" id="place-status" aria-live="polite"></div>
        <label class="field"><span>Notes</span><input name="notes" placeholder="Reservation under Tim, dress code…" value="${v('notes')}"></label>
        <details class="more" ${it?.opentableRid || it?.bookingUrl ? 'open' : ''}>
          <summary>${icon('utensils')} Booking — OpenTable or a link</summary>
          <div class="form">
            <label class="field"><span>OpenTable link or restaurant ID</span>
              <input name="opentable" placeholder="https://www.opentable.com/restref/client/?rid=1779" value="${esc(it?.opentableRid ?? '')}"></label>
            <p class="hint">With an OpenTable ID, everyone can book right inside the trip.
              <a href="${esc(embed.openTableSearch(trip.destination))}" target="_blank" rel="noopener">Search OpenTable ↗</a></p>
            <label class="field"><span>Other booking link</span><input name="bookingUrl" type="url" placeholder="Resy, tour, hotel…" value="${v('bookingUrl')}"></label>
          </div>
        </details>
      </form>`,
    foot: `<button class="btn btn-primary btn-lg" form="item-form">${it ? 'Save changes' : 'Add to plan'}</button>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#item-form');
      const status = dlg.querySelector('#place-status');
      // Look the place up as they type, so they know whether it gets a pin.
      // Editing without changing the place keeps its existing pin.
      let found = it?.place ? { q: it.place, hit: it.lat != null ? { lat: it.lat, lon: it.lon } : null } : { q: '', hit: null };
      let timer;
      const lookup = async (q) => {
        if (!q) { found = { q, hit: null }; status.className = 'place-status'; status.textContent = ''; return found; }
        if (!hasGoogleKey) {
          // No key: show Google's own map of what they typed, so they can check it.
          found = { q, hit: null };
          status.className = 'place-status';
          status.innerHTML = `<iframe class="place-preview" title="Map preview" loading="lazy"
            src="${esc(embed.mapEmbed(placeQuery({ place: q }, trip)))}"></iframe>`;
          return found;
        }
        status.className = 'place-status';
        status.textContent = 'Looking it up on Google Maps…';
        const hit = await googleFindPlace(placeQuery({ place: q }, trip), trip).catch(() => null);
        if (form.elements.place.value.trim() !== q) return found; // they kept typing
        found = { q, hit };
        status.className = `place-status ${hit ? 'found' : 'missing'}`;
        status.innerHTML = hit
          ? `${icon('pin', 'tiny')}On Google Maps: ${esc(hit.label)}`
          : `${icon('info', 'tiny')}Google couldn't find that — add a street or town to pin it`;
        return found;
      };
      form.elements.place.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => lookup(form.elements.place.value.trim()), 700);
      });

      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        const ot = f.opentable.trim();
        const rid = ot ? embed.openTableRid(ot) : null;
        if (ot && !rid && !/^https?:/.test(ot)) return toast("That doesn't look like an OpenTable link or ID", { error: true });
        // An OpenTable link without an ID can't be embedded — keep it as a plain link.
        const bookingUrl = f.bookingUrl.trim() || (ot && !rid ? ot : '');
        const ok = await busy(dlg.querySelector('.sheet-foot .btn'), async () => {
          const place = f.place.trim();
          const { hit } = place && found.q !== place ? await lookup(place) : found;
          const item = {
            title: f.title.trim(), day: f.day, time: f.time, place, notes: f.notes.trim(),
            opentableRid: rid ?? '', bookingUrl, lat: place ? hit?.lat ?? '' : '', lon: place ? hit?.lon ?? '' : '',
          };
          return it ? store.updateItem(trip.id, it.id, item) : store.addItem(trip.id, item);
        });
        if (ok) {
          close();
          ctx.refresh(it ? 'Plan updated' : found.hit || (!hasGoogleKey && f.place.trim()) ? 'Added to the plan and the map' : 'Added to the plan');
        }
      };
      setTimeout(() => form.elements.title.focus(), 50);
    },
  });
}

function mapCard(trip) {
  const pins = pinned(trip);
  const stays = staysOnMap(trip);
  if (!trip.destination && !pins.length && !stays.length) return '';
  const unpinned = hasGoogleKey ? trip.itinerary.filter((i) => i.place && i.lat == null).length : 0;
  return `
    <div class="card trip-map-card">
      <div id="trip-map" class="trip-map" role="region" aria-label="Map of the plans"></div>
      <div id="map-detail"></div>
      <div class="map-foot">${icon('pin', 'tiny')}
        ${pins.length || stays.length
          ? (hasGoogleKey ? `${pins.length} plan${pins.length === 1 ? '' : 's'}${stays.length ? ' + where you\'re staying' : ''} · tap a pin for details`
            : 'Tap a button to see that place on the map')
          : 'Plans with a place show up on the map'}
        ${unpinned ? ` · ${unpinned} not found` : ''}</div>
    </div>`;
}

// Plans added before maps existed: the organizer's device finds and saves
// their pins once per session, then redraws.
const tried = new Set();
async function pinOlderPlans(ctx) {
  const todo = ctx.trip.itinerary.filter((i) => i.place && i.lat == null && !tried.has(i.id));
  const stays = ctx.trip.stays.filter((st) => (st.address || st.name) && st.lat == null && !tried.has(st.id));
  if (!todo.length && !stays.length) return;
  let added = 0;
  for (const st of stays) {
    tried.add(st.id);
    const hit = await googleFindPlace(stayQuery(st, ctx.trip), ctx.trip).catch(() => null);
    if (hit) { await store.setStayLocation(ctx.trip.id, st.id, hit.lat, hit.lon).catch(() => {}); added++; }
  }
  for (const it of todo) {
    tried.add(it.id);
    const hit = await googleFindPlace(placeQuery(it, ctx.trip), ctx.trip).catch(() => null);
    if (hit) { await store.setItemLocation(ctx.trip.id, it.id, hit.lat, hit.lon).catch(() => {}); added++; }
  }
  if (added && !document.querySelector('dialog[open]')) ctx.refresh();
}
