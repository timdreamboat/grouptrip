// Lists: the group's "who's bringing what" and your own private packing list.
import { esc, icon, avatar, busy } from '../ui.js';
import * as store from '../store.js';
import { memberById, firstName } from './common.js';

const GROUP_IDEAS = ['Sunscreen', 'Bluetooth speaker', 'First-aid kit', 'Snacks', 'Drinks', 'Coffee', 'Card games', 'Bug spray', 'Beach towels', 'Phone tripod'];
const PACKING_IDEAS = ['ID / passport', 'Phone charger', 'Wallet', 'Medications', 'Toiletries', 'Sunglasses', 'Headphones', 'Swimsuit', 'Jacket', 'Comfortable shoes'];

export function render(el, ctx) {
  const { trip } = ctx;
  const shared = trip.lists.filter((l) => !l.personal);
  const mine = trip.lists.filter((l) => l.personal);
  const packed = mine.filter((l) => l.done).length;
  const unclaimed = shared.filter((l) => !l.claimedBy).length;

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">Lists</h1><div class="sub">Who's bringing what, and your own packing list</div></div>
    </header>
    <div class="stack-lg">
      <section>
        <div class="section-head"><h2>Who's bringing what</h2><span class="sub">${shared.length ? (unclaimed ? `${unclaimed} unclaimed` : 'All covered') : 'Shared with everyone'}</span></div>
        <div class="card stack" style="gap:12px">
          ${addForm('shared', 'Add something the group needs')}
          ${ideas(GROUP_IDEAS, shared, 'shared')}
          ${shared.length ? `<div class="rows">${shared.map((l) => sharedRow(l, ctx)).join('')}</div>` : ''}
        </div>
      </section>

      <section>
        <div class="section-head"><h2 style="display:flex;align-items:center;gap:8px">${icon('lock')}My packing list</h2>
          <span class="sub">${mine.length ? `${packed} of ${mine.length} packed` : 'Only you can see this'}</span></div>
        <div class="card stack" style="gap:12px">
          ${mine.length ? `<div class="progress"><span style="width:${Math.round((packed / mine.length) * 100)}%"></span></div>` : ''}
          ${addForm('personal', 'Add something to pack')}
          ${ideas(PACKING_IDEAS, mine, 'personal')}
          ${mine.length ? `<div class="rows">${mine.map((l) => personalRow(l)).join('')}</div>` : ''}
        </div>
      </section>
    </div>`;

  el.querySelectorAll('form[data-list]').forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const text = form.elements.text.value.trim();
      if (!text) return;
      const ok = await busy(form.querySelector('button'), () => store.addListItem(trip.id, text, form.dataset.list === 'personal'));
      if (ok) { await ctx.refresh(); el.querySelector(`form[data-list="${form.dataset.list}"] input`)?.focus(); }
    };
  });

  el.onclick = (e) => {
    const t = e.target.closest('[data-idea],[data-done],[data-claim],[data-unclaim],[data-del]');
    if (!t) return;
    if (t.dataset.idea) return ctx.run(() => store.addListItem(trip.id, t.dataset.idea, t.dataset.kind === 'personal'));
    if (t.dataset.done) return ctx.run(() => store.updateListItem(trip.id, t.dataset.done, { done: t.getAttribute('aria-checked') !== 'true' }));
    if (t.dataset.claim) return ctx.run(() => store.updateListItem(trip.id, t.dataset.claim, { claim: true }), "Thanks — you're bringing it");
    if (t.dataset.unclaim) return ctx.run(() => store.updateListItem(trip.id, t.dataset.unclaim, { claim: false }));
    if (t.dataset.del) return ctx.run(() => store.removeListItem(trip.id, t.dataset.del));
  };
}

const addForm = (kind, placeholder) => `
  <form data-list="${kind}" style="display:flex;gap:8px">
    <input class="input" name="text" maxlength="200" placeholder="${esc(placeholder)}" autocomplete="off" style="flex:1">
    <button class="btn btn-primary btn-icon" style="width:48px;height:48px" aria-label="Add">${icon('plus')}</button>
  </form>`;

function ideas(all, existing, kind) {
  const have = new Set(existing.map((l) => l.text.toLowerCase()));
  const left = all.filter((i) => !have.has(i.toLowerCase())).slice(0, 6);
  if (!left.length) return '';
  return `<div class="picks" style="gap:6px">${left.map((i) =>
    `<button type="button" class="btn btn-xs btn-secondary" data-idea="${esc(i)}" data-kind="${kind}">${icon('plus')}${esc(i)}</button>`).join('')}</div>`;
}

const checkbox = (l) => `<button type="button" class="check ${l.done ? 'done' : ''}" role="checkbox" aria-checked="${l.done}"
  data-done="${l.id}" aria-label="${esc(l.text)}" style="cursor:pointer;background-clip:padding-box">${icon('check')}</button>`;

function sharedRow(l, { trip, isOrg }) {
  const who = l.claimedBy && memberById(trip, l.claimedBy);
  const mine = l.claimedBy === trip.me.id;
  const canRemove = isOrg || l.createdBy === trip.me.id;
  return `
    <div class="row" style="min-height:56px">
      ${checkbox(l)}
      <div class="grow"><div class="title" style="${l.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(l.text)}</div>
        ${who ? `<div class="sub">${mine ? "You're bringing it" : `${esc(firstName(who.name))} is bringing it`}</div>` : ''}</div>
      ${who ? (mine ? `<button class="btn btn-xs btn-ghost" data-unclaim="${l.id}">Undo</button>` : avatar(who, 28))
        : `<button class="btn btn-xs btn-secondary" data-claim="${l.id}">${icon('hand')}I'll bring it</button>`}
      ${canRemove ? `<button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${l.id}" aria-label="Remove">${icon('x')}</button>` : ''}
    </div>`;
}

const personalRow = (l) => `
  <div class="row" style="min-height:52px">
    ${checkbox(l)}
    <div class="grow"><div class="title" style="${l.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(l.text)}</div></div>
    <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${l.id}" aria-label="Remove">${icon('x')}</button>
  </div>`;
