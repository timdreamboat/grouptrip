// Create a trip in three quick questions: where, when, who's organizing.
import { esc, icon, coverBg, busy, toast, suggest } from '../ui.js';
import * as store from '../store.js';
import { locate, suggestDestinations } from '../places.js';
import { mapEmbed } from '../embeds.js';
import { mountCoverPicker } from './cover.js';
import { KINDS } from './common.js';

const STEPS = 3;

export function render(root) {
  document.title = 'New trip · GroupTrip';
  const data = { destination: '', name: '', startDate: '', endDate: '', organizer: '', cover: null, kind: 'friends', where: null };
  let photosFor = null; // destination the photo picker last searched
  let searchTimer;
  let step = 0;

  // Google's own map of the picked place, like the Place field on plans.
  const destMap = () => `<iframe class="dest-map" title="Map of ${esc(data.destination)}" loading="lazy"
    src="${esc(mapEmbed(data.where.label))}"></iframe>`;

  const views = [
    () => `
      <div class="eyebrow">Step 1 of ${STEPS}</div>
      <h1 class="display">Where are you going?</h1>
      <div class="cover-preview" style="background:${esc(coverBg(data.destination || 'trip', data.cover?.url))}"></div>
      <input class="input input-xl" name="destination" placeholder="Las Vegas" value="${esc(data.destination)}" autocomplete="off" required>
      <p class="hint" style="margin-top:10px">A city, a region, a beach — anything.</p>
      <div id="dest-map">${data.where ? destMap() : ''}</div>
      <div id="photos-wrap" style="margin-top:18px" ${data.destination ? '' : 'hidden'}>
        <div class="field"><span>Pick a cover photo</span><div id="photos"></div></div>
      </div>`,
    () => `
      <div class="eyebrow">Step 2 of ${STEPS}</div>
      <h1 class="display">When?</h1>
      <div class="grid-2">
        <label class="field"><span>Start</span><input type="date" name="startDate" value="${esc(data.startDate)}"></label>
        <label class="field"><span>End</span><input type="date" name="endDate" value="${esc(data.endDate)}"></label>
      </div>
      <p class="hint" style="margin-top:10px">Not sure yet? Skip it — you can add dates later.</p>`,
    () => `
      <div class="eyebrow">Step 3 of ${STEPS}</div>
      <h1 class="display">Last thing.</h1>
      <div class="form">
        <div class="field"><span>What kind of trip?</span>
          <div class="kind-picks">${Object.entries(KINDS).map(([k, v]) => `
            <label><input type="radio" name="kind" value="${k}" ${data.kind === k ? 'checked' : ''}>
              <span class="kind-card"><b>${v.label}</b><small>${v.blurb}</small></span></label>`).join('')}</div></div>
        <label class="field"><span>Trip name</span><input name="name" required maxlength="120" value="${esc(data.name || (data.destination ? `${data.destination} trip` : ''))}"></label>
        <label class="field"><span>Your name</span><input name="organizer" required maxlength="80" value="${esc(data.organizer)}" placeholder="So your friends know who invited them" autocomplete="given-name"></label>
      </div>`,
  ];

  const draw = () => {
    root.innerHTML = `
      <div class="flow">
        <header class="site-head" style="padding:0 16px;max-width:560px;margin:0 auto;width:100%">
          <a class="btn btn-icon btn-secondary btn-sm" href="#/" aria-label="Cancel">${icon('x')}</a>
          <div class="flow-steps" style="width:120px">${Array.from({ length: STEPS }, (_, i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
          <span style="width:36px"></span>
        </header>
        <form class="flow-body" id="flow" novalidate>
          ${views[step]()}
          <div class="flow-nav">
            ${step ? `<button type="button" class="btn btn-secondary btn-lg" data-back>${icon('back')}</button>` : ''}
            <button class="btn btn-primary btn-lg">${step === STEPS - 1 ? `Create trip ${icon('sparkle')}` : step === 1 && !data.startDate ? 'Skip for now' : `Continue ${icon('arrow')}`}</button>
          </div>
        </form>
      </div>`;
    const form = root.querySelector('#flow');
    const first = form.querySelector('input');
    setTimeout(() => first?.focus(), 30);

    const preview = () => { form.querySelector('.cover-preview').style.background = coverBg(data.destination || 'trip', data.cover?.url); };
    const searchPhotos = () => {
      const dest = data.destination.trim();
      const wrap = form.querySelector('#photos-wrap');
      if (!wrap) return;
      wrap.hidden = !dest;
      if (!dest || dest === photosFor) return;
      photosFor = dest;
      data.cover = null;
      mountCoverPicker(form.querySelector('#photos'), dest, {
        autoPick: true, onPick: (p) => { data.cover = p; preview(); },
      });
    };
    if (step === 0 && data.destination) {
      photosFor = null;
      const keep = data.cover;
      mountCoverPicker(form.querySelector('#photos'), data.destination, {
        selected: keep?.url, onPick: (p) => { data.cover = p; preview(); },
      });
      photosFor = data.destination.trim();
    }

    const destInput = form.elements.destination;
    if (destInput) {
      suggest(destInput, {
        search: suggestDestinations,
        onPick: (it) => {
          data.destination = it.name;
          data.where = { lat: it.lat, lon: it.lon, label: [it.name, it.detail].filter(Boolean).join(', ') };
          form.querySelector('#dest-map').innerHTML = destMap();
          preview();
          clearTimeout(searchTimer);
          searchPhotos();
        },
      });
    }

    form.addEventListener('input', (e) => {
      data[e.target.name] = e.target.value;
      if (e.target.name === 'destination') {
        // Typed something else after picking: the pinned spot no longer applies.
        if (data.where) { data.where = null; form.querySelector('#dest-map').innerHTML = ''; }
        preview();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchPhotos, 600);
      }
      if (step === 1) form.querySelector('.btn-primary').innerHTML = data.startDate ? `Continue ${icon('arrow')}` : 'Skip for now';
    });
    form.querySelector('[data-back]')?.addEventListener('click', () => { step--; draw(); });
    form.onsubmit = async (e) => {
      e.preventDefault();
      for (const el of form.querySelectorAll('input:not([type=radio])')) data[el.name] = el.value.trim();
      const kind = form.querySelector('[name=kind]:checked');
      if (kind) data.kind = kind.value;
      if (step === 0 && !data.destination) return toast('Where are you headed?', { error: true });
      if (step === 1 && data.endDate && data.startDate && data.endDate < data.startDate) return toast('The end date is before the start date', { error: true });
      if (step < STEPS - 1) { step++; draw(); return; }
      if (!data.name || !data.organizer) return toast('Add a trip name and your name', { error: true });
      const code = await busy(form.querySelector('.btn-primary'), async () => {
        const c = await store.createTrip(data);
        // Cover photo + map location (for the weather). Nice-to-have: never block creating the trip.
        const where = data.where ? { lat: data.where.lat, lon: data.where.lon } : await locate(data.destination).catch(() => null);
        await store.updateTrip(c, { ...(where ?? {}), ...(data.cover ? { cover: data.cover } : {}) }).catch(() => {});
        return c;
      });
      if (code) { sessionStorage.setItem('grouptrip.flash', 'Trip created — now invite your crew'); location.hash = `#/t/${code}`; }
    };
  };
  draw();
}
