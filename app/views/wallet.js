// Money: your balance up top, the fewest payments to settle up (yours
// first, with Venmo), and every expense with what it means for you.
import { esc, icon, avatar, fmtShort, sheet, confirmSheet, busy, toast, emptyState } from '../ui.js';
import { fmt, toCents, equalShares, balances, settleUp } from '../money.js';
import * as store from '../store.js';
import * as embed from '../embeds.js';
import { memberById, nameOf, firstName } from './common.js';

export function render(el, ctx) {
  const { trip } = ctx;
  const meId = trip.me.id;
  const money = (c) => fmt(c, trip.currency);
  const bal = balances(trip);
  const mine = bal[meId] ?? 0;
  const pays = settleUp(bal).sort((a, b) => (b.from === meId || b.to === meId) - (a.from === meId || a.to === meId));
  const total = trip.expenses.reduce((s, e) => s + e.amount, 0);
  const who = (id) => (id === meId ? 'You' : firstName(nameOf(trip, id)));

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">Money</h1><div class="sub">${money(total)} spent by the group</div></div>
      <button class="btn page-action" data-action="add">${icon('plus')}Add expense</button>
    </header>

    <div class="stack-lg">
      <section class="balance-hero ${mine < 0 ? 'owe' : mine > 0 ? 'owed' : 'square'}">
        <div class="eyebrow">${mine < 0 ? 'You owe' : mine > 0 ? "You're owed" : 'Your balance'}</div>
        <div class="amount">${mine === 0 ? 'All square' : money(Math.abs(mine))}</div>
        <div class="small muted">${mine === 0 ? 'Nothing to settle right now.' : mine < 0 ? 'Settle up below — one tap with Venmo.' : 'Friends can pay you back below.'}</div>
      </section>

      ${pays.length ? `
      <section>
        <div class="section-head"><h2>Settle up</h2><span class="sub">${pays.length} payment${pays.length === 1 ? '' : 's'} squares everyone</span></div>
        <div class="card card-tight rows">
          ${pays.map((p) => {
            const to = memberById(trip, p.to);
            return `
            <div class="pay-row ${p.from === meId ? 'me' : ''}">
              <div class="pay-flow">${avatar(memberById(trip, p.from), 32)}${icon('arrow')}${avatar(to, 32)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.from === meId
                  ? `Pay ${esc(firstName(to?.name))}`
                  : p.to === meId ? `${esc(who(p.from))} pays you` : `${esc(who(p.from))} → ${esc(who(p.to))}`}</div>
              </div>
              <span class="amt">${money(p.amount)}</span>
              ${p.from === meId && trip.currency === 'USD' ? `<a class="btn btn-sm btn-primary" target="_blank" rel="noopener"
                  href="${esc(embed.venmoLink(p.amount, `${trip.name} ✈︎`, to?.venmo))}">Venmo</a>` : ''}
            </div>`;
          }).join('')}
        </div>
        ${pays.some((p) => p.from === meId && !memberById(trip, p.to)?.venmo) ? `<p class="hint" style="margin:8px 4px 0">Tip: ask them to add their Venmo in GroupTrip so the button goes straight to them.</p>` : ''}
      </section>` : ''}

      <section>
        <div class="section-head"><h2>Expenses</h2><span class="sub">${trip.expenses.length}</span></div>
        ${trip.expenses.length ? `<div class="card card-tight rows">
          ${trip.expenses.map((e) => {
            const myShare = e.splits.find((s) => s.memberId === meId)?.share ?? 0;
            const iPaid = e.paidBy === meId;
            const effect = iPaid ? e.amount - myShare : -myShare;
            const canRemove = ctx.isOrg || iPaid || e.createdBy === meId;
            return `
            <div class="row">
              <div class="tl-icon">${icon('receipt')}</div>
              <div class="grow">
                <div class="title">${esc(e.description)}</div>
                <div class="sub">${esc(who(e.paidBy))} paid ${money(e.amount)} · ${e.splits.length === trip.members.length ? 'split with everyone' : `split ${e.splits.length} ways`}${e.spentOn ? ` · ${esc(fmtShort(e.spentOn))}` : ''}</div>
              </div>
              <div style="text-align:right">
                <div class="amt ${effect > 0 ? 'pos' : effect < 0 ? 'neg' : ''}">${effect === 0 ? '—' : money(Math.abs(effect))}</div>
                <div class="small muted">${effect > 0 ? 'you lent' : effect < 0 ? 'you owe' : 'not involved'}</div>
              </div>
              ${canRemove ? `<button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${e.id}" aria-label="Remove expense">${icon('trash')}</button>` : ''}
            </div>`;
          }).join('')}
        </div>` : `<div class="card">${emptyState('wallet', 'No expenses yet', 'Log what you paid for the group — GroupTrip works out who owes whom.',
          `<button class="btn btn-primary" data-action="add">${icon('plus')}Add an expense</button>`)}</div>`}
      </section>
    </div>`;

  el.onclick = async (e) => {
    const t = e.target.closest('[data-action],[data-del]');
    if (!t) return;
    if (t.dataset.action === 'add') return openAddExpense(ctx);
    if (t.dataset.del) {
      const ok = await confirmSheet({ title: 'Remove this expense?', message: 'Balances will update for everyone.', confirm: 'Remove', danger: true });
      if (ok) ctx.run(() => store.removeExpense(trip.id, t.dataset.del), 'Expense removed');
    }
  };
}

function openAddExpense(ctx) {
  const { trip } = ctx;
  const people = trip.members.filter((m) => m.rsvp !== 'declined');
  const symbol = new Intl.NumberFormat(undefined, { style: 'currency', currency: trip.currency }).formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? '$';
  const label = (m) => (m.id === trip.me.id ? 'Me' : firstName(m.name));

  sheet({
    title: 'Add an expense',
    body: `
      <form class="form" id="expense-form">
        <label class="amount-input"><span>${esc(symbol)}</span>
          <input name="amount" inputmode="decimal" placeholder="0" required autocomplete="off" aria-label="Amount"></label>
        <label class="field"><span>What was it for?</span><input name="description" required maxlength="200" placeholder="Groceries, gas, cabin…"></label>
        <div class="field"><span>Paid by</span><div class="picks">
          ${people.map((m) => `<label><input type="radio" name="paidBy" value="${m.id}" ${m.id === trip.me.id ? 'checked' : ''}>
            <span class="pick">${avatar(m, 30)}${esc(label(m))}</span></label>`).join('')}</div></div>
        <div class="field"><span>Split equally between</span><div class="picks">
          ${people.map((m) => `<label><input type="checkbox" name="split" value="${m.id}" checked>
            <span class="pick">${avatar(m, 30)}${esc(label(m))}</span></label>`).join('')}</div></div>
        <p class="hint" id="each"></p>
      </form>`,
    foot: `<button class="btn btn-primary btn-lg" form="expense-form">Add expense</button>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#expense-form');
      const each = dlg.querySelector('#each');
      const update = () => {
        const amount = toCents(form.elements.amount.value);
        const n = form.querySelectorAll('[name=split]:checked').length;
        each.textContent = amount > 0 && n ? `${fmt(Math.floor(amount / n), trip.currency)} each, split ${n} way${n === 1 ? '' : 's'}` : '';
      };
      form.addEventListener('input', update);
      form.addEventListener('change', update);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const amount = toCents(form.elements.amount.value);
        const splitIds = [...form.querySelectorAll('[name=split]:checked')].map((c) => c.value);
        if (amount <= 0) return toast('Enter an amount', { error: true });
        if (!splitIds.length) return toast('Pick who to split with', { error: true });
        const ok = await busy(dlg.querySelector('.sheet-foot .btn'), () => store.addExpense(trip.id, {
          description: form.elements.description.value.trim(), amount,
          paidBy: form.querySelector('[name=paidBy]:checked').value, splits: equalShares(amount, splitIds),
        }));
        if (ok) { close(); ctx.refresh('Expense added'); }
      };
      setTimeout(() => form.elements.amount.focus(), 50);
    },
  });
}
