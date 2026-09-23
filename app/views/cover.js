// Cover photo picker: photos of the destination to choose from.
import { esc } from '../ui.js';
import { coverOptions } from '../places.js';

// Renders into `el`. onPick(photo | null) fires when the choice changes,
// including the automatic first pick when `autoPick` is set.
export async function mountCoverPicker(el, destination, { selected = null, autoPick = false, onPick }) {
  const ticket = (el.dataset.ticket = String(Math.random()));
  el.innerHTML = `<div class="cover-grid">${'<button type="button" class="skeleton" disabled></button>'.repeat(6)}</div>`;
  const photos = await coverOptions(destination);
  if (el.dataset.ticket !== ticket) return; // a newer search replaced this one
  if (!photos.length) {
    el.innerHTML = '<p class="hint">No photos found for that place — we\'ll use a color cover instead.</p>';
    onPick?.(null);
    return;
  }
  let current = selected ?? (autoPick ? photos[0].url : null);
  const draw = () => {
    el.innerHTML = `<div class="cover-grid">
      ${photos.map((p, i) => `<button type="button" data-i="${i}" ${p.bad ? 'hidden' : ''} class="${p.url === current ? 'on' : ''}"
          style="background-image:url('${esc(p.thumb.replace(/'/g, '%27'))}')" aria-label="Choose photo ${i + 1}"></button>`).join('')}
      <button type="button" class="none ${current ? '' : 'on'}" data-none>Colors only</button>
    </div>`;
  };
  draw();
  if (autoPick && !selected) onPick?.(photos[0]);
  // Drop photos whose image won't load (moved or removed at the source).
  photos.forEach((p) => {
    const img = new Image();
    img.onerror = () => { p.bad = true; el.querySelector(`[data-i="${photos.indexOf(p)}"]`)?.setAttribute('hidden', ''); };
    img.src = p.thumb;
  });
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const photo = b.hasAttribute('data-none') ? null : photos[Number(b.dataset.i)];
    current = photo?.url ?? null;
    draw();
    onPick?.(photo);
  };
}
