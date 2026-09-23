// Polls: settle group decisions — dates or anything else. Anyone can start
// one; faces show who picked what. Closing a poll lets the organizer lock in
// the winner as the trip dates or a plan on the calendar.
import { esc, icon, avatarStack, fmtRange, sheet, confirmSheet, busy, toast, emptyState } from '../ui.js';
import * as store from '../store.js';
import { going, nameOf, firstName } from './common.js';
import { openAddItem } from './plan.js';

const TEMPLATES = [
  { kind: 'date', question: 'Which dates work?' },
  { kind: 'text', question: 'Where should we eat?' },
  { kind: 'text', question: 'What should we do Saturday?' },
];

export const openPolls = (trip) => trip.polls.filter((p) => !p.closed);
export const needsMyVote = (trip) =>
  openPolls(trip).filter((p) => !p.options.some((o) => o.votes.includes(trip.me.id)));

export function render(el, ctx) {
  const { trip } = ctx;
  const open = openPolls(trip);
  const closed = trip.polls.filter((p) => p.closed);

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">Polls</h1><div class="sub">Decide dates, dinners and plans together</div></div>
      <button class="btn page-action" data-action="new">${icon('plus')}New poll</button>
    </header>
    <div class="stack-lg">
      ${trip.polls.length ? '' : `<div class="card">${emptyState('list', 'No polls yet',
        'Can\'t agree on a weekend or a restaurant? Put it to a vote.',
        `<div class="picks" style="justify-content:center">${TEMPLATES.map((t, i) =>
          `<button class="btn btn-sm btn-secondary" data-template="${i}">${esc(t.question)}</button>`).join('')}</div>`)}</div>`}
      ${open.length ? `<section class="stack">${open.map((p) => pollCard(p, ctx)).join('')}</section>` : ''}
      ${closed.length ? `<section><div class="section-head"><h2>Decided</h2><span class="sub">${closed.length}</span></div>
        <div class="stack">${closed.map((p) => pollCard(p, ctx)).join('')}</div></section>` : ''}
    </div>`;

  el.onclick = (e) => handlePollClick(e, ctx);
}

export function pollCard(p, ctx) {
  const { trip, isOrg } = ctx;
  const meId = trip.me.id;
  const canManage = isOrg || p.createdBy === meId;
  const voters = new Set(p.options.flatMap((o) => o.votes));
  const top = Math.max(0, ...p.options.map((o) => o.votes.length));
  const base = Math.max(going(trip).length, voters.size, 1);
  const waiting = going(trip).filter((m) => !voters.has(m.id));
  const canAdd = !p.closed && (p.allowAdd || canManage);

  return `
  <article class="card poll ${p.closed ? 'closed' : ''}">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <div class="tl-icon">${icon(p.kind === 'date' ? 'calendar' : 'list')}</div>
      <div style="flex:1;min-width:0">
        <h3 style="font-size:17px">${esc(p.question)}</h3>
        <div class="small muted">${esc(p.createdBy === meId ? 'You' : firstName(nameOf(trip, p.createdBy)))} asked ·
          ${voters.size} voted${p.closed ? '' : ` · ${p.multi ? 'pick any' : 'pick one'}`}</div>
      </div>
      ${p.closed ? `<span class="pill going">${icon('check')}Decided</span>` : ''}
    </div>

    <div class="opts">
      ${p.options.map((o) => {
        const mine = o.votes.includes(meId);
        const lead = top > 0 && o.votes.length === top;
        const pct = Math.round((o.votes.length / base) * 100);
        const people = o.votes.map((id) => trip.members.find((m) => m.id === id)).filter(Boolean);
        return `
        <button class="opt ${mine ? 'on' : ''} ${lead ? 'lead' : ''}" ${p.closed ? 'disabled' : ''}
            data-vote="${o.id}" data-on="${!mine}" aria-pressed="${mine}">
          <span class="opt-bar" style="width:${pct}%"></span>
          <span class="opt-check">${icon('check')}</span>
          <span class="opt-label">${esc(o.label)}</span>
          <span class="opt-votes">${people.length ? avatarStack(people, 3, 22) : ''}<b>${o.votes.length}</b></span>
        </button>
        ${p.closed && lead && isOrg ? lockIn(p, o) : ''}`;
      }).join('')}
    </div>

    ${!p.closed && waiting.length && canManage ? `<p class="hint" style="margin-top:10px">Waiting on ${esc(waiting.slice(0, 4).map((m) => m.id === meId ? 'you' : firstName(m.name)).join(', '))}${waiting.length > 4 ? ` +${waiting.length - 4}` : ''}</p>` : ''}

    ${canAdd || canManage ? `<div class="tl-actions">
      ${canAdd ? `<button class="btn btn-xs btn-secondary" data-add-option="${p.id}">${icon('plus')}Add option</button>` : ''}
      <span style="flex:1"></span>
      ${canManage ? `<button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-edit-poll="${p.id}" aria-label="Edit poll">${icon('pencil')}</button>
        <button class="btn btn-xs btn-ghost" data-close="${p.id}" data-closed="${!p.closed}">${p.closed ? 'Reopen' : 'Close poll'}</button>
        <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del-poll="${p.id}" aria-label="Delete poll">${icon('trash')}</button>` : ''}
    </div>` : ''}
  </article>`;
}

// Organizer's one-tap "make it official" for the winning option.
function lockIn(p, o) {
  if (p.kind === 'date' && o.startDate) {
    return `<button class="btn btn-sm btn-accent lock" data-lock-dates="${o.id}">${icon('calendar')}Set as trip dates</button>`;
  }
  return `<button class="btn btn-sm btn-accent lock" data-lock-plan="${o.id}">${icon('calplus')}Add to the calendar</button>`;
}

export async function handlePollClick(e, ctx) {
  const t = e.target.closest('[data-action],[data-template],[data-vote],[data-add-option],[data-close],[data-del-poll],[data-lock-dates],[data-lock-plan],[data-edit-poll]');
  if (!t) return false;
  const { trip } = ctx;
  const pollOf = (optId) => trip.polls.find((p) => p.options.some((o) => o.id === optId));
  const optOf = (optId) => pollOf(optId)?.options.find((o) => o.id === optId);

  if (t.dataset.action === 'new') openNewPoll(ctx);
  else if (t.dataset.editPoll) openEditPoll(ctx, trip.polls.find((p) => p.id === t.dataset.editPoll));
  else if (t.dataset.template) openNewPoll(ctx, TEMPLATES[Number(t.dataset.template)]);
  else if (t.dataset.vote) {
    t.classList.toggle('on', t.dataset.on === 'true'); // feel instant
    ctx.run(() => store.setVote(trip.id, t.dataset.vote, t.dataset.on === 'true'));
  } else if (t.dataset.addOption) openAddOption(ctx, trip.polls.find((p) => p.id === t.dataset.addOption));
  else if (t.dataset.close) {
    const closing = t.dataset.closed === 'true';
    ctx.run(() => store.closePoll(trip.id, t.dataset.close, closing), closing ? 'Poll closed' : 'Poll reopened');
  } else if (t.dataset.delPoll) {
    const ok = await confirmSheet({ title: 'Delete this poll?', message: 'The votes go with it.', confirm: 'Delete', danger: true });
    if (ok) ctx.run(() => store.removePoll(trip.id, t.dataset.delPoll), 'Poll deleted');
  } else if (t.dataset.lockDates) {
    const o = optOf(t.dataset.lockDates);
    ctx.run(() => store.updateTrip(trip.id, { startDate: o.startDate, endDate: o.endDate || o.startDate }), `Trip dates set: ${fmtRange(o.startDate, o.endDate)}`);
  } else if (t.dataset.lockPlan) {
    openAddItem(ctx, null, { title: optOf(t.dataset.lockPlan).label });
  }
  return true;
}

// ---------- new poll ----------
function openNewPoll(ctx, preset = { kind: 'text', question: '' }) {
  let kind = preset.kind;
  const { trip } = ctx;
  const textRow = (v = '') => `<div class="opt-input"><input class="input" name="opt" maxlength="200" placeholder="Option" value="${esc(v)}"></div>`;
  const dateRow = (s = '', e = '') => `<div class="opt-input grid-2">
      <input class="input" type="date" name="optStart" value="${esc(s)}" aria-label="From">
      <input class="input" type="date" name="optEnd" value="${esc(e)}" aria-label="To"></div>`;

  sheet({
    title: 'New poll',
    body: `
      <form class="form" id="poll-form">
        <div class="segmented" role="group" aria-label="Poll type">
          <button type="button" data-kind="text">Anything</button>
          <button type="button" data-kind="date">Dates</button>
        </div>
        <label class="field"><span>Question</span><input name="question" required maxlength="200" value="${esc(preset.question)}"></label>
        <div class="field"><span id="opts-label"></span><div class="stack" style="gap:8px" id="opts"></div></div>
        <button type="button" class="btn btn-sm btn-secondary" data-more style="justify-self:start">${icon('plus')}Add option</button>
        <label class="switch"><input type="checkbox" name="multi" checked><span></span>People can pick more than one</label>
        <label class="switch"><input type="checkbox" name="allowAdd" checked><span></span>Anyone can add options</label>
      </form>`,
    foot: '<button class="btn btn-primary btn-lg" form="poll-form">Start poll</button>',
    onMount(dlg, close) {
      const form = dlg.querySelector('#poll-form');
      const opts = dlg.querySelector('#opts');
      const setKind = (k) => {
        kind = k;
        dlg.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === k));
        dlg.querySelector('#opts-label').textContent = k === 'date' ? 'Date options (from – to)' : 'Options';
        form.elements.question.placeholder = k === 'date' ? 'Which dates work?' : 'Where should we eat?';
        opts.innerHTML = k === 'date'
          ? dateRow(trip.startDate || '', trip.endDate || '') + dateRow()
          : textRow() + textRow();
      };
      setKind(kind);
      dlg.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => setKind(b.dataset.kind));
      dlg.querySelector('[data-more]').onclick = () => {
        opts.insertAdjacentHTML('beforeend', kind === 'date' ? dateRow() : textRow());
        opts.lastElementChild.querySelector('input').focus();
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const options = kind === 'date'
          ? [...opts.children].map((row) => {
              const [s, en] = [...row.querySelectorAll('input')].map((i) => i.value);
              return s ? { label: fmtRange(s, en || s), startDate: s, endDate: en || s } : null;
            }).filter(Boolean)
          : [...opts.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean).map((label) => ({ label }));
        if (options.length < 2) return toast('Add at least two options', { error: true });
        if (options.some((o) => o.endDate && o.endDate < o.startDate)) return toast('An option ends before it starts', { error: true });
        const ok = await busy(dlg.querySelector('.sheet-foot .btn'), () => store.createPoll(trip.id, {
          question: form.elements.question.value.trim() || form.elements.question.placeholder,
          kind, multi: form.elements.multi.checked, allowAdd: form.elements.allowAdd.checked, options,
        }));
        if (ok) { close(); ctx.refresh('Poll started — share it with the group'); }
      };
    },
  });
}

function openAddOption(ctx, poll) {
  sheet({
    title: 'Add an option',
    body: `
      <form class="form" id="opt-form">
        ${poll.kind === 'date'
          ? `<div class="grid-2"><label class="field"><span>From</span><input type="date" name="start" required></label>
             <label class="field"><span>To</span><input type="date" name="end"></label></div>`
          : '<label class="field"><span>Option</span><input name="label" required maxlength="200"></label>'}
        <button class="btn btn-primary btn-lg">Add</button>
      </form>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#opt-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        const option = poll.kind === 'date'
          ? { label: fmtRange(f.start, f.end || f.start), startDate: f.start, endDate: f.end || f.start }
          : { label: f.label.trim() };
        const ok = await busy(form.querySelector('.btn'), () => store.addPollOption(ctx.trip.id, poll.id, option));
        if (ok) { close(); ctx.refresh('Option added'); }
      };
      setTimeout(() => form.querySelector('input').focus(), 50);
    },
  });
}

// Reword the question or remove options (votes on a removed option go with it).
function openEditPoll(ctx, poll) {
  const { trip } = ctx;
  sheet({
    title: 'Edit poll',
    body: `
      <form class="form" id="edit-poll">
        <label class="field"><span>Question</span><input name="question" required maxlength="200" value="${esc(poll.question)}"></label>
        <div class="field"><span>Options</span>
          <div class="rows">${poll.options.map((o) => `
            <div class="row" style="min-height:48px">
              <div class="grow"><div class="title">${esc(o.label)}</div>
                <div class="sub">${o.votes.length} vote${o.votes.length === 1 ? '' : 's'}</div></div>
              ${poll.options.length > 2 ? `<button type="button" class="btn btn-xs btn-ghost" data-remove-opt="${o.id}">${icon('x')}Remove</button>` : ''}
            </div>`).join('')}</div>
          ${poll.options.length <= 2 ? '<p class="hint">A poll needs at least two options.</p>' : ''}
        </div>
        <button class="btn btn-primary btn-lg">Save question</button>
      </form>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#edit-poll');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const ok = await busy(form.querySelector('.btn-primary'), () => store.updatePoll(trip.id, poll.id, form.elements.question.value.trim()));
        if (ok) { close(); ctx.refresh('Poll updated'); }
      };
      dlg.querySelectorAll('[data-remove-opt]').forEach((b) => b.onclick = async () => {
        const opt = poll.options.find((o) => o.id === b.dataset.removeOpt);
        close();
        const ok = await confirmSheet({ title: `Remove "${opt.label}"?`,
          message: opt.votes.length ? `Its ${opt.votes.length} vote${opt.votes.length === 1 ? '' : 's'} will be removed too.` : 'Nobody has voted for it yet.',
          confirm: 'Remove', danger: true });
        if (ok) ctx.run(() => store.removePollOption(trip.id, opt.id), 'Option removed');
      });
    },
  });
}
