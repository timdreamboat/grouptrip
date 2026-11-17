// "Find places": dinner, drinks, things to do, shows, casinos… around the
// trip, closest first (owner, 2026-11-17 — everyone who tried the app looked
// for this). Places come from OpenStreetMap through Photon (free, keyless);
// reviews, photos and hours stay on Google Maps, tables on OpenTable and
// tickets on the ticket sites — each opens on its own site.
import { esc, icon, sheet, toast } from '../ui.js';
import * as embed from '../embeds.js';
import { tripCenter, nearbyPlaces, searchPlaces, mergePlaces } from '../places.js';
import { words } from './common.js';

// OpenStreetMap tags per category; `plan` names the plan ("Dinner at …").
export const CATEGORIES = [
  { id: 'eat', label: 'Restaurants', emoji: '🍽', tags: ['amenity:restaurant'], plan: (n) => `Dinner at ${n}`, opentable: true },
  { id: 'drinks', label: 'Bars & nightlife', emoji: '🍸', tags: ['amenity:bar', 'amenity:pub', 'amenity:nightclub', 'amenity:biergarten'], plan: (n) => `Drinks at ${n}` },
  { id: 'coffee', label: 'Coffee', emoji: '☕', tags: ['amenity:cafe', 'shop:bakery'], plan: (n) => `Coffee at ${n}` },
  { id: 'todo', label: 'Things to do', emoji: '🎡', tags: ['tourism:attraction', 'tourism:theme_park', 'tourism:zoo', 'tourism:aquarium', 'leisure:bowling_alley', 'leisure:amusement_arcade', 'leisure:escape_game', 'leisure:miniature_golf', 'leisure:water_park'] },
  { id: 'shows', label: 'Shows & music', emoji: '🎭', tags: ['amenity:theatre', 'amenity:cinema', 'amenity:arts_centre', 'amenity:music_venue', 'amenity:concert_hall', 'amenity:events_venue', 'leisure:stadium'] },
  { id: 'casinos', label: 'Casinos', emoji: '🎰', tags: ['amenity:casino'], radiusKm: 100 },
  { id: 'museums', label: 'Museums', emoji: '🖼', tags: ['tourism:museum', 'tourism:gallery'] },
  { id: 'outdoors', label: 'Outdoors', emoji: '🌳', tags: ['leisure:park', 'leisure:nature_reserve', 'natural:beach', 'tourism:viewpoint', 'leisure:golf_course'] },
  { id: 'shopping', label: 'Shopping', emoji: '🛍', tags: ['shop:mall', 'shop:department_store', 'amenity:marketplace'] },
  { id: 'events', label: 'Events & concerts', emoji: '🎟', events: true },
];

// The row of category buttons on the Calendar page.
export const exploreStrip = () => `
  <div class="explore-strip" role="group" aria-label="Find places">
    <button class="explore-chip find" data-explore="eat">${icon('search')}Find places</button>
    ${CATEGORIES.map((c) => `<button class="explore-chip" data-explore="${c.id}"><span aria-hidden="true">${c.emoji}</span>${c.label}</button>`).join('')}
  </div>`;

const googleMaps = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(', '))}`;
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Ticket and event sites, searched for the destination (and the trip's dates
// where the site takes them). They block embedding, so each opens in a new tab.
function eventLinks(trip) {
  const where = (trip.destination || '').split(',')[0].trim();
  const q = encodeURIComponent(where);
  const dates = trip.startDate ? `&startDate=${trip.startDate}&endDate=${trip.endDate || trip.startDate}` : '';
  const when = trip.startDate ? ` ${new Date(`${trip.startDate}T12:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : '';
  return [
    ['Google', `https://www.google.com/search?q=${encodeURIComponent(`events in ${where}${when}`)}&ibp=htl;events`, 'Everything on, in one list'],
    ['Ticketmaster', `https://www.ticketmaster.com/search?q=${q}${dates}`, 'Concerts, sports, comedy'],
    ['Eventbrite', `https://www.eventbrite.com/d/${slug(where)}/all-events/${trip.startDate ? `?start_date=${trip.startDate}&end_date=${trip.endDate || trip.startDate}` : ''}`, 'Local events and festivals'],
    ['SeatGeek', `https://seatgeek.com/search?search=${q}`, 'Tickets, compared'],
  ];
}

// Opens the finder. `category` picks the starting tab. With `onPick`, choosing
// a place hands it back (the plan form uses this) instead of starting a plan.
export function openExplore(ctx, { category = 'eat', onPick = null } = {}) {
  const { trip, isOrg } = ctx;
  const miles = trip.currency === 'USD';
  let cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  let center = null, places = [], open = null, ticket = 0, wide = false, text = '', ring = 0;
  // Measure from the place everyone's staying, or the middle of town.
  const origins = [
    ...trip.stays.filter((st) => st.lat != null).map((st) => ({ id: st.id, lat: st.lat, lon: st.lon, label: st.name })),
    ...(trip.lat != null ? [{ id: 'center', lat: trip.lat, lon: trip.lon, label: `${(trip.destination || 'Town').split(',')[0]} center` }] : []),
  ];

  sheet({
    title: 'Find places',
    wide: true,
    body: `
      <div class="explore">
        <input class="input" id="ex-q" type="search" placeholder="Search by name — sushi, rooftop bar, a venue…" autocomplete="off" aria-label="Search places">
        <div class="explore-cats" role="tablist">${CATEGORIES.map((c) => `<button role="tab" data-cat="${c.id}"><span aria-hidden="true">${c.emoji}</span>${c.label}</button>`).join('')}</div>
        <div class="explore-near small muted" id="ex-near"></div>
        <div id="ex-list"></div>
      </div>`,
    onMount(dlg, close) {
      const list = dlg.querySelector('#ex-list'), near = dlg.querySelector('#ex-near'), input = dlg.querySelector('#ex-q');

      const drawTabs = () => dlg.querySelectorAll('[data-cat]').forEach((b) => {
        const on = !text && b.dataset.cat === cat.id;
        b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
      });
      const drawNear = () => {
        if (cat.events && !text) { near.innerHTML = ''; return; }
        near.innerHTML = !center ? '' : origins.length > 1
          ? `${icon('pin', 'tiny')}Closest to <select id="ex-origin" aria-label="Closest to">${origins.map((o) => `<option value="${esc(o.id)}" ${o.lat === center.lat && o.lon === center.lon ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select> first`
          : `${icon('pin', 'tiny')}Closest to ${esc(center.label)} first`;
      };
      const actions = (p) => `
        <div class="explore-detail">
          <iframe class="place-preview" title="Map of ${esc(p.name)}" loading="lazy" src="${esc(embed.mapEmbed([p.name, p.address].filter(Boolean).join(', ')))}"></iframe>
          <div class="tl-actions">
            ${onPick ? `<button class="btn btn-primary btn-sm" data-use>${icon('check')}Use this place</button>`
              : isOrg ? `<button class="btn btn-primary btn-sm" data-use>${icon('plus')}${esc(words(trip).addPlan)}</button>` : ''}
            <a class="btn btn-secondary btn-sm" href="${esc(googleMaps(p))}" target="_blank" rel="noopener noreferrer" title="Reviews, photos and hours on Google Maps">Reviews &amp; hours ${icon('external')}</a>
            ${cat.opentable && !text ? `<a class="btn btn-outline btn-sm" href="${esc(embed.openTableSearch(`${p.name} ${p.town}`))}" target="_blank" rel="noopener noreferrer">Find on OpenTable ${icon('external')}</a>` : ''}
          </div>
          ${!onPick && !isOrg ? '<p class="hint" style="margin:8px 0 0">Like it? Tell your organizer, or start a poll in Group.</p>' : ''}
        </div>`;
      const drawList = () => {
        list.innerHTML = `
          ${wide ? `<p class="hint" style="margin:0 0 8px">${icon('info', 'tiny')} Nothing by that name near ${esc(center?.label || 'the trip')} — these are further away.</p>` : ''}
          <div class="rows explore-rows">${places.map((p, i) => `
            <div class="explore-row ${open === i ? 'open' : ''}">
              <button class="row row-link" data-i="${i}" aria-expanded="${open === i}">
                <span class="grow"><span class="title">${esc(p.name)}</span>
                  <span class="sub">${esc([p.kind, p.address.split(',').slice(0, 2).join(',')].filter(Boolean).join(' · '))}</span></span>
                <span class="explore-dist tabular">${esc(p.dist)}</span>
              </button>
              ${open === i ? actions(p) : ''}
            </div>`).join('')}</div>
          ${!text && places.length >= 40 && ring < 8 ? `<button class="btn btn-secondary btn-block" data-more style="margin-top:12px">Show more, further out</button>` : ''}`;
      };
      const drawEvents = () => {
        list.innerHTML = `
          <p class="hint" style="margin:0 0 10px">Tickets live on the ticket sites. These open already searched for <b>${esc((trip.destination || 'your trip').split(',')[0])}</b>${trip.startDate ? ' on your dates' : ''} — find one, then add it as a plan with its link.</p>
          <div class="rows">${eventLinks(trip).map(([name, url, sub]) => `
            <a class="row row-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
              <span class="tl-icon" aria-hidden="true">🎟</span>
              <span class="grow"><span class="title">${esc(name)}</span><span class="sub">${esc(sub)}</span></span>${icon('external')}</a>`).join('')}</div>
          <div class="tl-actions">
            ${isOrg && !onPick ? `<button class="btn btn-primary btn-sm" data-event-plan>${icon('plus')}Add an event to the plan</button>` : ''}
            <button class="btn btn-secondary btn-sm" data-cat="shows">🎭 Venues nearby</button>
          </div>`;
      };
      const state = (title, sub) => { list.innerHTML = `<div class="explore-empty"><b>${esc(title)}</b><span class="small muted">${esc(sub)}</span></div>`; };

      const load = async () => {
        const mine = ++ticket;
        open = null; wide = false; ring = 0;
        drawTabs();
        if (cat.events && !text) { drawNear(); return drawEvents(); }
        list.innerHTML = `<div class="rows">${'<div class="skeleton" style="height:56px;margin:6px 0"></div>'.repeat(6)}</div>`;
        try {
          center = center ?? await tripCenter(trip);
          if (!center) return state('Add a destination first', 'Places are found around where the trip is.');
          if (center.label === trip.destination && !origins.length) origins.push({ id: 'center', ...center, label: `${center.label.split(',')[0]} center` });
          drawNear();
          if (text) ({ places, wide } = await searchPlaces(text, center, { miles, streets: false }));
          else places = await nearbyPlaces(center, cat.tags, { miles, radiusKm: cat.radiusKm });
        } catch (err) {
          if (mine === ticket) state("Couldn't load places", err.name === 'AbortError' ? 'That took too long — tap the category to try again.' : 'Check your connection and try again.');
          return;
        }
        if (mine !== ticket) return; // a newer search replaced this one
        if (!places.length) return state(text ? `No "${text}" found` : `No ${cat.label.toLowerCase()} found nearby`, text ? 'Try a different name, or pick a category.' : 'Try another category, or search by name.');
        drawList();
      };

      let timer;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { text = input.value.trim().length >= 2 ? input.value.trim() : ''; load(); }, 350);
      });
      dlg.addEventListener('change', (e) => {
        if (e.target.id !== 'ex-origin') return;
        center = origins.find((o) => o.id === e.target.value) ?? center;
        load();
      });
      dlg.querySelector('.explore').addEventListener('click', async (e) => {
        const tab = e.target.closest('[data-cat]');
        if (tab) { cat = CATEGORIES.find((c) => c.id === tab.dataset.cat); text = ''; input.value = ''; return load(); }
        if (e.target.closest('[data-event-plan]')) {
          close();
          const { openAddItem } = await import('./plan.js');
          return openAddItem(ctx, null, { booking: true });
        }
        const more = e.target.closest('[data-more]');
        if (more) {
          const mine = ticket, picked = open == null ? null : places[open];
          more.disabled = true; more.textContent = 'Looking further out…';
          const extra = await nearbyPlaces(center, cat.tags, { miles, radiusKm: cat.radiusKm, ring: ring + 1 }).catch(() => []);
          if (mine !== ticket) return;
          ring += 1;
          const before = places.length;
          places = mergePlaces(places, extra);
          open = picked ? places.indexOf(picked) : null;
          if (places.length === before) { ring = 99; toast("That's everything nearby"); }
          return drawList();
        }
        const use = e.target.closest('[data-use]');
        if (use) {
          const p = places[open];
          const picked = { name: p.name, lat: p.lat, lon: p.lon, label: [p.name, p.address].filter(Boolean).join(', ') };
          close();
          if (onPick) return onPick(picked);
          const { openAddItem } = await import('./plan.js');
          return openAddItem(ctx, null, { title: !text && cat.plan ? cat.plan(p.name) : p.name, place: picked });
        }
        const row = e.target.closest('[data-i]');
        if (row) { const i = Number(row.dataset.i); open = open === i ? null : i; drawList(); list.querySelector('.explore-row.open')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      });
      load();
    },
  });
}

// Clicks on the Calendar page's strip.
export function handleExploreClick(e, ctx) {
  const b = e.target.closest('[data-explore]');
  if (!b) return false;
  openExplore(ctx, { category: b.dataset.explore });
  return true;
}
