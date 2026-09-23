// Shared photo album: everyone adds photos from their phone; the grid groups
// them by day and opens a full-screen viewer (swipe or arrow keys).
import { esc, icon, avatar, fmtDay, confirmSheet, toast, emptyState } from '../ui.js';
import * as store from '../store.js';
import { memberById, firstName } from './common.js';

const dayOf = (iso) => iso.slice(0, 10);

export function render(el, ctx) {
  const { trip } = ctx;
  const photos = trip.photos;
  const people = new Set(photos.map((p) => p.uploadedBy)).size;
  const groups = [];
  for (const p of photos) {
    const d = dayOf(localIso(p.createdAt));
    if (groups.at(-1)?.day !== d) groups.push({ day: d, items: [] });
    groups.at(-1).items.push(p);
  }

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">Photos</h1>
        <div class="sub">${photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} from ${people} ${people === 1 ? 'person' : 'people'}` : 'One album for the whole group'}</div></div>
      <button class="btn page-action" data-action="add">${icon('plus')}Add photos</button>
    </header>
    <input type="file" accept="image/*" multiple hidden id="photo-input">
    <div id="upload-status"></div>
    ${photos.length ? groups.map((g) => `
      <section style="margin-bottom:22px">
        <div class="day-head"><h3>${esc(fmtDay(g.day, { weekday: 'long', month: 'short', day: 'numeric' }))}</h3>
          <span class="small muted">${g.items.length}</span></div>
        <div class="photo-grid">${g.items.map((p) => `
          <button class="photo" data-open="${p.id}" aria-label="Open photo">
            <img src="${esc(store.photoUrl(p.thumbPath))}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>
      </section>`).join('')
    : `<div class="card">${emptyState('sparkle', 'Start the album', 'Add photos from your phone — everyone on the trip can see them and save the ones they like.',
        `<button class="btn btn-primary" data-action="add">${icon('plus')}Add photos</button>`)}</div>`}`;

  const input = el.querySelector('#photo-input');
  input.onchange = () => upload(el, ctx, [...input.files]);
  el.onclick = (e) => {
    const t = e.target.closest('[data-action],[data-open]');
    if (!t) return;
    if (t.dataset.action === 'add') input.click();
    if (t.dataset.open) openViewer(ctx, photos.findIndex((p) => p.id === t.dataset.open));
  };
}

// createdAt is a UTC timestamp; group by the viewer's local day.
function localIso(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function upload(el, ctx, files) {
  const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!images.length) return;
  const status = el.querySelector('#upload-status');
  const draw = (done) => {
    status.innerHTML = `<div class="card stack" style="gap:10px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between"><b>Uploading ${Math.min(done + 1, images.length)} of ${images.length}…</b>
        <span class="small muted tabular">${Math.round((done / images.length) * 100)}%</span></div>
      <div class="progress"><span style="width:${(done / images.length) * 100}%"></span></div></div>`;
  };
  draw(0);
  let ok = 0;
  try { ok = await store.uploadPhotos(ctx.trip.id, images, draw); }
  catch (err) { status.innerHTML = ''; toast(err.message, { error: true }); return; }
  const skipped = images.length - ok;
  ctx.refresh(ok ? `${ok} photo${ok === 1 ? '' : 's'} added${skipped ? ` · ${skipped} couldn't be read` : ''}` : "Those photos couldn't be read");
}

// ---------- full-screen viewer ----------
function openViewer(ctx, start) {
  const { trip, isOrg } = ctx;
  const photos = trip.photos;
  let i = start;
  const dlg = document.createElement('dialog');
  dlg.className = 'viewer';
  document.body.append(dlg);

  const draw = () => {
    const p = photos[i];
    const by = memberById(trip, p.uploadedBy);
    const mine = p.uploadedBy === trip.me.id;
    dlg.innerHTML = `
      <div class="viewer-top">
        <button class="btn btn-icon viewer-btn" data-close aria-label="Close">${icon('x')}</button>
        <div class="viewer-who">${by ? avatar(by, 28) : ''}<div><div style="font-weight:600">${esc(mine ? 'You' : firstName(by?.name) || 'Someone')}</div>
          <div class="small" style="opacity:.7">${esc(fmtDay(localIso(p.createdAt)))} · ${i + 1} of ${photos.length}</div></div></div>
        <span style="flex:1"></span>
        <button class="btn btn-icon viewer-btn" data-save aria-label="Save">${icon('share')}</button>
        ${mine || isOrg ? `<button class="btn btn-icon viewer-btn" data-del aria-label="Delete">${icon('trash')}</button>` : ''}
      </div>
      <div class="viewer-stage">
        <img src="${esc(store.photoUrl(p.path))}" alt="" style="background-image:url('${esc(store.photoUrl(p.thumbPath))}')">
        ${i > 0 ? `<button class="viewer-nav prev" data-prev aria-label="Previous">${icon('back')}</button>` : ''}
        ${i < photos.length - 1 ? `<button class="viewer-nav next" data-next aria-label="Next">${icon('chevron')}</button>` : ''}
      </div>`;
  };
  const go = (d) => { const n = i + d; if (n >= 0 && n < photos.length) { i = n; draw(); } };

  dlg.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-close')) dlg.close();
    else if (t.hasAttribute('data-prev')) go(-1);
    else if (t.hasAttribute('data-next')) go(1);
    else if (t.hasAttribute('data-save')) save(photos[i]);
    else if (t.hasAttribute('data-del')) {
      const ok = await confirmSheet({ title: 'Delete this photo?', message: 'It will be removed for everyone.', confirm: 'Delete', danger: true });
      if (!ok) return;
      try { await store.removePhoto(trip.id, photos[i].id); } catch (err) { toast(err.message, { error: true }); return; }
      dlg.close();
      ctx.refresh('Photo deleted');
    }
  });
  dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
  let x0 = null;
  dlg.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  dlg.addEventListener('pointerup', (e) => {
    if (x0 !== null && Math.abs(e.clientX - x0) > 50) go(e.clientX < x0 ? 1 : -1);
    x0 = null;
  });
  dlg.addEventListener('close', () => dlg.remove());
  draw();
  dlg.showModal();
}

// Share sheet on phones (Save Image lives there); download on desktop.
async function save(p) {
  try {
    const blob = await fetch(store.photoUrl(p.path)).then((r) => r.blob());
    const file = new File([blob], `grouptrip-${p.id.slice(0, 8)}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (err) {
    if (err.name !== 'AbortError') toast("Couldn't save that photo", { error: true });
  }
}

// Latest photos for Home.
export function photoStrip({ trip }) {
  if (!trip.photos.length) return '';
  return `
  <section>
    <div class="section-head"><h2>Photos</h2><a class="btn btn-xs btn-ghost" href="#/t/${trip.id}/photos">See all ${trip.photos.length}</a></div>
    <a class="photo-strip" href="#/t/${trip.id}/photos">${trip.photos.slice(0, 6).map((p) =>
      `<img src="${esc(store.photoUrl(p.thumbPath))}" alt="" loading="lazy">`).join('')}</a>
  </section>`;
}
