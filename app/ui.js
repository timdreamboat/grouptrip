// Shared UI building blocks: escaping, icons, avatars, covers, dates,
// bottom sheets, toasts, share/copy.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- icons (Lucide-style strokes, ISC license) ----------
const PATHS = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V13h6v9"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3"/><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 12h-4a2 2 0 0 0 0 4h4z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  crown: '<path d="M11.6 3.3a.5.5 0 0 1 .8 0l2.9 5.2a1 1 0 0 0 1.5.3l4.1-3.4a.5.5 0 0 1 .8.5l-2.8 10.4a1 1 0 0 1-1 .7H6.1a1 1 0 0 1-1-.7L2.3 5.9a.5.5 0 0 1 .8-.5l4.1 3.4a1 1 0 0 0 1.5-.3z"/><path d="M5 21h14"/>',
  sliders: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  map: '<path d="M14.1 5.6 9.9 3.4a2 2 0 0 0-1.8 0L3.6 5.7A1 1 0 0 0 3 6.6v13.2a1 1 0 0 0 1.4.9l3.7-1.9a2 2 0 0 1 1.8 0l4.2 2.2a2 2 0 0 0 1.8 0l4.5-2.3a1 1 0 0 0 .6-.9V4.6a1 1 0 0 0-1.4-.9l-3.7 1.9a2 2 0 0 1-1.8 0z"/><path d="M15 5.8v15M9 3.2v15"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  sparkle: '<path d="M12 3 13.9 8.1 19 10 13.9 11.9 12 17 10.1 11.9 5 10 10.1 8.1Z"/><path d="M19 17v4M17 19h4"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>',
  pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  radar: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.5M7.8 16.2a6 6 0 0 1 0-8.5M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
  receipt: '<path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-3-2-2 2Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  bed: '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6M2 17h20"/>',
  list: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4M12 8h.01"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  luggage: '<rect x="5" y="7" width="14" height="13" rx="2.5"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7M9 11v5M15 11v5M8 20v1.5M16 20v1.5"/>',
  calplus: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18M12 13.5v5M9.5 16h5"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
};
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;

// ---------- identity visuals ----------
export function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

// A soft mesh gradient seeded by the destination, so every trip has its own cover.
export function cover(seed) {
  const h = hash(seed || 'trip') % 360;
  return [
    `radial-gradient(at 12% 18%, hsl(${h} 95% 68%) 0, transparent 52%)`,
    `radial-gradient(at 88% 8%, hsl(${(h + 45) % 360} 92% 62%) 0, transparent 50%)`,
    `radial-gradient(at 78% 92%, hsl(${(h + 320) % 360} 88% 56%) 0, transparent 55%)`,
    `radial-gradient(at 8% 96%, hsl(${(h + 90) % 360} 80% 58%) 0, transparent 50%)`,
    `hsl(${(h + 15) % 360} 72% 50%)`,
  ].join(', ');
}

// Outside links: only plain web addresses ever become clickable (never
// "javascript:" or other tricks), shown with the site's name so people can see
// where they're going. The database enforces the same rule.
export function safeUrl(url) {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\/[^\s<>"']+$/i.test(u)) return null;
  try { return new URL(u).href; } catch { return null; }
}
export const siteName = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// The trip's chosen photo, over its gradient (which also shows while it loads).
export function coverBg(seed, url) {
  return url ? `url('${String(url).replace(/'/g, '%27')}') center / cover no-repeat, ${cover(seed)}` : cover(seed);
}

export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export function avatar(m, size = 36) {
  const pending = m && m.joined === false;
  return `<span class="av${pending ? ' pending' : ''}" style="--h:${hash(m?.name) % 360};--size:${size}px" title="${esc(m?.name)}">${esc(initials(m?.name))}</span>`;
}

export function avatarStack(members, max = 5, size = 30) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return `<span class="av-stack">${shown.map((m) => avatar(m, size)).join('')}${extra > 0 ? `<span class="av av-more" style="--size:${size}px">+${extra}</span>` : ''}</span>`;
}

// ---------- dates & times ----------
const d0 = (iso) => new Date(`${iso}T00:00`);
export const fmtDay = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  iso ? d0(iso).toLocaleDateString(undefined, opts) : '';
export const fmtShort = (iso) => fmtDay(iso, { month: 'short', day: 'numeric' });

export function fmtRange(start, end) {
  if (!start) return 'Dates TBD';
  if (!end || end === start) return fmtDay(start, { weekday: 'short', month: 'short', day: 'numeric' });
  const a = d0(start), b = d0(end);
  if (a.getMonth() === b.getMonth()) return `${fmtShort(start)} – ${b.getDate()}`;
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
export const daysUntil = (iso) => Math.round((d0(iso) - today()) / 86400000);

export function countdown(trip) {
  if (!trip.startDate) return null;
  const n = daysUntil(trip.startDate);
  const end = trip.endDate ? daysUntil(trip.endDate) : n;
  if (end < 0) return 'Trip complete';
  if (n <= 0) return 'Happening now';
  if (n === 1) return 'Tomorrow';
  if (n < 60) return `In ${n} days`;
  return `In ${Math.round(n / 7)} weeks`;
}

export function tripDays(trip) {
  if (!trip.startDate) return [];
  const out = [];
  const end = trip.endDate || trip.startDate;
  for (let d = d0(trip.startDate); d <= d0(end) && out.length < 31; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

// ---------- feedback ----------
let toastTimer;
export function toast(message, { error = false } = {}) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(error ? 'x' : 'check')}<span>${esc(message)}</span>`;
  // As a popover it sits in the top layer, above any open sheet (a plain
  // element would be hidden behind the sheet's backdrop).
  el.setAttribute('popover', 'manual');
  document.body.append(el);
  try { el.showPopover(); } catch { /* older browsers: normal stacking */ }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 2600);
}

export async function copy(text, message = 'Link copied') {
  try { await navigator.clipboard.writeText(text); toast(message); }
  catch { prompt('Copy this:', text); }
}

// Native share sheet on phones; copy on desktop.
export async function share({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  copy(text ? `${text} ${url}` : url);
}

// ---------- sheets (bottom sheet on phones, dialog on desktop) ----------
// body: HTML string. onMount(el, close) wires up events. Returns close().
export function sheet({ title = '', body = '', foot = '', wide = false, embed = false, onMount } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = `sheet${wide ? ' wide' : ''}${embed ? ' embed' : ''}`;
  dlg.innerHTML = `
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2>${esc(title)}</h2>
      <button class="btn btn-icon btn-secondary btn-sm" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body">${body}</div>
    ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  document.body.append(dlg);
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.querySelector('[data-close]').onclick = close;
  dlg.showModal();
  onMount?.(dlg, close);
  return close;
}

export function confirmSheet({ title, message, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    sheet({
      title,
      body: `<p class="muted" style="margin:0 0 4px">${esc(message)}</p>`,
      foot: `<button class="btn btn-secondary" data-no>Cancel</button>
             <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>`,
      onMount(el, close) {
        el.querySelector('[data-no]').onclick = () => close();
        el.querySelector('[data-yes]').onclick = () => { answered = true; resolve(true); close(); };
        el.addEventListener('close', () => { if (!answered) resolve(false); });
      },
    });
  });
}

// Embedded partner site in a sheet.
export function embedSheet(title, src) {
  sheet({
    title, embed: true, wide: true,
    body: `<iframe src="${esc(src)}" title="${esc(title)}" referrerpolicy="no-referrer-when-downgrade"></iframe>`,
  });
}

// Run an async action with a disabled button; failures become an error toast.
// Resolves to the action's result (or true), or false if it failed.
export async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return (await fn()) ?? true; }
  catch (err) { toast(err.message, { error: true }); return false; }
  finally { if (btn) btn.disabled = false; }
}

export const emptyState = (ic, title, text, action = '') => `
  <div class="empty"><div class="empty-icon">${icon(ic)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

// Type-ahead list under an input. search(q, signal) → [{ name, detail }];
// onPick(item) runs when one is chosen (tap, or arrow keys + Enter).
export function suggest(input, { search, onPick, min = 2, wait = 250 }) {
  const box = document.createElement('div');
  box.className = 'suggest';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  const wrap = document.createElement('div');
  wrap.className = 'suggest-wrap';
  input.replaceWith(wrap);
  wrap.append(input, box);
  input.setAttribute('aria-autocomplete', 'list');
  let items = [], active = -1, timer, ctrl, picked = input.value;
  const close = () => { box.hidden = true; active = -1; };
  const draw = () => {
    box.innerHTML = items.map((it, i) => `
      <button type="button" role="option" class="suggest-item${i === active ? ' on' : ''}" data-i="${i}" aria-selected="${i === active}">
        ${icon('pin', 'tiny')}<span><b>${esc(it.name)}</b>${it.detail ? `<small>${esc(it.detail)}</small>` : ''}</span>
      </button>`).join('');
    box.hidden = !items.length;
  };
  const choose = (i) => {
    const it = items[i];
    if (!it) return;
    input.value = picked = it.name;
    close();
    onPick(it);
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    ctrl?.abort();
    const q = input.value.trim();
    if (q.length < min || q === picked) { items = []; close(); return; }
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try { items = await search(q, ctrl.signal); } catch { return; }
      if (input.value.trim() !== q) return;
      active = -1;
      draw();
    }, wait);
  });
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      draw();
    } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  // pointerdown so the pick lands before the input loses focus
  box.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) { e.preventDefault(); choose(Number(b.dataset.i)); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}
