// Money: your balance up top, the fewest payments to settle up (yours first,
// with Venmo and "mark as paid"), payment history, and every expense with
// what it means for you. Expenses can be split equally, by exact amounts or
// by shares, entered in another currency, and carry a receipt photo.
import { esc, icon, avatar, fmtShort, sheet, confirmSheet, busy, toast, emptyState } from '../ui.js';
import { fmt, toCents, equalShares, weightedShares, balances, settleUp, rateTo, CURRENCIES } from '../money.js';
import * as store from '../store.js';
import * as embed from '../embeds.js';
import { memberById, nameOf, firstName, isBusiness } from './common.js';
import * as biz from './bizexpenses.js';

export function render(el, ctx) {
  if (isBusiness(ctx.trip)) return biz.render(el, ctx);
  const { trip, isOrg } = ctx;
  const meId = trip.me.id;
  const money = (c) => fmt(c, trip.currency);
  const bal = balances(trip);
  const mine = bal[meId] ?? 0;
  const pays = settleUp(bal).sort((a, b) => (b.from === meId || b.to === meId) - (a.from === meId || a.to === meId));
  const total = trip.expenses.reduce((s, e) => s + e.amount, 0);
  const who = (id) => (id === meId ? 'You' : firstName(nameOf(trip, id)));
  const settlements = trip.settlements ?? [];

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">Money</h1><div class="sub">${money(total)} spent by the group</div></div>
      <button class="btn page-action" data-action="add">${icon('plus')}Add expense</button>
    </header>

    <div class="stack-lg">
      <section class="balance-hero ${mine < 0 ? 'owe' : mine > 0 ? 'owed' : 'square'}">
        <div class="eyebrow">${mine < 0 ? 'You owe' : mine > 0 ? "You're owed" : 'Your balance'}</div>
        <div class="amount">${mine === 0 ? 'All square' : money(Math.abs(mine))}</div>
        <div class="small muted">${mine === 0 ? 'Nothing to settle right now.' : mine < 0 ? 'Pay below, then tap "Mark paid".' : 'When someone pays you, tap "Got it".'}</div>
      </section>

      ${pays.length ? `
      <section>
        <div class="section-head"><h2>Settle up</h2><span class="sub">${pays.length} payment${pays.length === 1 ? '' : 's'} squares everyone</span></div>
        <div class="card card-tight rows">
          ${pays.map((p) => {
            const to = memberById(trip, p.to);
            const involved = p.from === meId || p.to === meId;
            return `
            <div class="pay-row ${p.from === meId ? 'me' : ''}">
              <div class="pay-flow">${avatar(memberById(trip, p.from), 32)}${icon('arrow')}${avatar(to, 32)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.from === meId
                  ? `Pay ${esc(firstName(to?.name))}`
                  : p.to === meId ? `${esc(who(p.from))} pays you` : `${esc(who(p.from))} → ${esc(who(p.to))}`}</div>
                <div class="amt">${money(p.amount)}</div>
              </div>
              <div class="pay-actions">
                ${p.from === meId && trip.currency === 'USD' ? `<a class="btn btn-sm btn-primary" target="_blank" rel="noopener"
                    href="${esc(embed.venmoLink(p.amount, `${trip.name} ✈︎`, to?.venmo))}">Venmo</a>` : ''}
                ${involved || isOrg ? `<button class="btn btn-sm btn-secondary" data-paid="${p.from}|${p.to}|${p.amount}">${icon('check')}${p.to === meId ? 'Got it' : 'Mark paid'}</button>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
        ${pays.some((p) => p.from === meId && !memberById(trip, p.to)?.venmo) && trip.currency === 'USD' ? `<p class="hint" style="margin:8px 4px 0">Tip: ask them to add their Venmo in GroupTrip so the button goes straight to them.</p>` : ''}
      </section>` : ''}

      ${settlements.length ? `
      <section>
        <div class="section-head"><h2>Payments</h2><span class="sub">${settlements.length}</span></div>
        <div class="card card-tight rows">
          ${settlements.map((x) => `
            <div class="row" style="min-height:52px">
              <div class="pay-flow">${avatar(memberById(trip, x.from), 28)}${icon('arrow')}${avatar(memberById(trip, x.to), 28)}</div>
              <div class="grow"><div class="title">${esc(who(x.from))} paid ${esc(x.to === meId ? 'you' : who(x.to))}</div>
                <div class="sub">${esc(fmtShort(localDay(new Date(x.createdAt))))}</div></div>
              <span class="amt pos">${money(x.amount)}</span>
              ${isOrg || [x.from, x.to, x.createdBy].includes(meId) ? `<button class="btn btn-xs btn-ghost" data-unpay="${x.id}">Undo</button>` : ''}
            </div>`).join('')}
        </div>
      </section>` : ''}

      <section>
        <div class="section-head"><h2>Expenses</h2><span class="sub">${trip.expenses.length}</span></div>
        ${trip.expenses.length ? `<div class="card card-tight rows">
          ${trip.expenses.map((e) => {
            const myShare = e.splits.find((s) => s.memberId === meId)?.share ?? 0;
            const iPaid = e.paidBy === meId;
            const effect = iPaid ? e.amount - myShare : -myShare;
            const canEdit = isOrg || iPaid || e.createdBy === meId;
            const how = e.splitMode === 'equal' || !e.splitMode
              ? (e.splits.length === trip.members.length ? 'split with everyone' : `split ${e.splits.length} ways`)
              : e.splitMode === 'shares' ? 'split by shares' : 'split by amounts';
            return `
            <div class="row">
              ${e.receiptThumb
                ? `<button class="receipt-thumb" data-receipt="${e.id}" aria-label="View receipt"><img src="${esc(store.photoUrl(e.receiptThumb))}" alt=""></button>`
                : `<div class="tl-icon">${icon('receipt')}</div>`}
              <div class="grow">
                <div class="title">${esc(e.description)}</div>
                <div class="sub">${esc(who(e.paidBy))} paid ${money(e.amount)}${e.originalCurrency ? ` (${esc(fmt(e.originalCents, e.originalCurrency))})` : ''} · ${how}${e.spentOn ? ` · ${esc(fmtShort(e.spentOn))}` : ''}</div>
              </div>
              <div style="text-align:right">
                <div class="amt ${effect > 0 ? 'pos' : effect < 0 ? 'neg' : ''}">${effect === 0 ? '—' : money(Math.abs(effect))}</div>
                <div class="small muted">${effect > 0 ? 'you lent' : effect < 0 ? 'you owe' : 'not involved'}</div>
              </div>
              ${canEdit ? `<div style="display:flex;flex-direction:column">
                <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-edit="${e.id}" aria-label="Edit expense">${icon('pencil')}</button>
                <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${e.id}" aria-label="Remove expense">${icon('trash')}</button></div>` : ''}
            </div>`;
          }).join('')}
        </div>` : `<div class="card">${emptyState('wallet', 'No expenses yet', 'Log what you paid for the group — GroupTrip works out who owes whom.',
          `<button class="btn btn-primary" data-action="add">${icon('plus')}Add an expense</button>`)}</div>`}
      </section>
    </div>`;

  el.onclick = async (e) => {
    const t = e.target.closest('[data-action],[data-del],[data-edit],[data-paid],[data-unpay],[data-receipt]');
    if (!t) return;
    if (t.dataset.action === 'add') return openAddExpense(ctx);
    if (t.dataset.edit) return openAddExpense(ctx, trip.expenses.find((x) => x.id === t.dataset.edit));
    if (t.dataset.receipt) {
      const x = trip.expenses.find((y) => y.id === t.dataset.receipt);
      return sheet({ title: x.description, body: `<img class="receipt-full" src="${esc(store.photoUrl(x.receiptPath))}" alt="Receipt">` });
    }
    if (t.dataset.paid) {
      const [from, to, amount] = t.dataset.paid.split('|');
      const ok = await confirmSheet({
        title: to === meId ? `Got ${money(Number(amount))} from ${firstName(nameOf(trip, from))}?` : `Mark ${money(Number(amount))} as paid?`,
        message: to === meId ? "This settles them up with you. They'll get a notification."
          : `${from === meId ? 'You' : firstName(nameOf(trip, from))} paid ${to === meId ? 'you' : firstName(nameOf(trip, to))}. Balances update for everyone.`,
        confirm: to === meId ? 'Yes, I got it' : 'Mark paid',
      });
      if (ok) ctx.run(() => store.addSettlement(trip.id, from, to, Number(amount)), 'Marked as paid');
      return;
    }
    if (t.dataset.unpay) return ctx.run(() => store.removeSettlement(trip.id, t.dataset.unpay), 'Payment undone');
    if (t.dataset.del) {
      const ok = await confirmSheet({ title: 'Remove this expense?', message: 'Balances will update for everyone.', confirm: 'Remove', danger: true });
      if (ok) ctx.run(() => store.removeExpense(trip.id, t.dataset.del), 'Expense removed');
    }
  };
}

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const symbolOf = (currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0)
  .find((p) => p.type === 'currency')?.value ?? currency;

// Add an expense, or edit one (pass the expense).
function openAddExpense(ctx, exp = null) {
  const { trip } = ctx;
  const inIt = (id) => exp && (exp.paidBy === id || exp.splits.some((x) => x.memberId === id));
  const people = trip.members.filter((m) => m.rsvp !== 'declined' || inIt(m.id));
  const payer = exp?.paidBy ?? trip.me.id;
  const splitOf = (id) => exp?.splits.find((x) => x.memberId === id);
  const label = (m) => (m.id === trip.me.id ? 'Me' : firstName(m.name));
  let currency = exp?.originalCurrency || trip.currency;
  let rate = exp?.rate ? Number(exp.rate) : 1;
  // Family trips default to shares, so each household can count its people.
  let mode = exp?.splitMode || (trip.kind === 'family' ? 'shares' : 'equal');
  let receipt = exp?.receiptPath ? { receiptPath: exp.receiptPath, receiptThumb: exp.receiptThumb } : null;
  let receiptFile = null;
  const entered = exp ? (exp.originalCents ?? exp.amount) : 0;
  const currencies = [...new Set([trip.currency, ...CURRENCIES])];

  sheet({
    title: exp ? 'Edit expense' : 'Add an expense',
    body: `
      <form class="form" id="expense-form">
        <div class="amount-input">
          <select name="currency" class="currency-pick" aria-label="Currency">
            ${currencies.map((c) => `<option value="${c}" ${c === currency ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <span id="sym">${esc(symbolOf(currency))}</span>
          <input name="amount" inputmode="decimal" placeholder="0" required autocomplete="off" aria-label="Amount" value="${exp ? (entered / 100).toFixed(2) : ''}">
        </div>
        <p class="hint" id="fx" style="text-align:center"></p>
        <label class="field"><span>What was it for?</span><input name="description" required maxlength="200" placeholder="Groceries, gas, cabin…" value="${esc(exp?.description ?? '')}"></label>
        <div class="field"><span>Paid by</span><div class="picks">
          ${people.map((m) => `<label><input type="radio" name="paidBy" value="${m.id}" ${m.id === payer ? 'checked' : ''}>
            <span class="pick">${avatar(m, 30)}${esc(label(m))}</span></label>`).join('')}</div></div>

        <div class="field"><span>Split</span>
          <div class="segmented" role="group" aria-label="How to split">
            ${[['equal', 'Equally'], ['amounts', 'Amounts'], ['shares', 'Shares']].map(([v, l]) =>
              `<button type="button" data-mode="${v}" class="${mode === v ? 'on' : ''}">${l}</button>`).join('')}
          </div>
        </div>
        ${trip.kind === 'family' ? '<p class="hint" style="margin-top:-6px">Tip: splitting by household? Give one person per family a share for each family member.</p>' : ''}
        <div id="split-equal" class="picks">
          ${people.map((m) => `<label><input type="checkbox" name="split" value="${m.id}" ${exp ? (splitOf(m.id) ? 'checked' : '') : 'checked'}>
            <span class="pick">${avatar(m, 30)}${esc(label(m))}</span></label>`).join('')}
        </div>
        <div id="split-amounts" class="rows split-rows">
          ${people.map((m) => {
            const s = splitOf(m.id);
            const v = exp?.splitMode === 'amounts' && s ? ((s.weight ?? s.share) / 100).toFixed(2) : '';
            return `<div class="row">${avatar(m, 30)}<span class="grow">${esc(label(m))}</span>
              <input class="input split-amt" inputmode="decimal" data-member="${m.id}" placeholder="0.00" value="${v}"></div>`;
          }).join('')}
        </div>
        <div id="split-shares" class="rows split-rows">
          ${people.map((m) => {
            const s = splitOf(m.id);
            const w = exp?.splitMode === 'shares' ? (s ? Number(s.weight ?? 1) : 0) : (exp ? (s ? 1 : 0) : 1);
            return `<div class="row">${avatar(m, 30)}<span class="grow">${esc(label(m))}</span>
              <div class="stepper"><button type="button" data-step="-1" data-member="${m.id}" aria-label="Fewer">−</button>
              <b data-weight="${m.id}">${w}</b>
              <button type="button" data-step="1" data-member="${m.id}" aria-label="More">+</button></div></div>`;
          }).join('')}
        </div>
        <p class="hint" id="each"></p>

        <div class="field"><span>Receipt</span>
          <div id="receipt-slot"></div>
          <input type="file" accept="image/*" id="receipt-input" hidden>
        </div>
      </form>`,
    foot: `<button class="btn btn-primary btn-lg" form="expense-form">${exp ? 'Save changes' : 'Add expense'}</button>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#expense-form');
      const each = dlg.querySelector('#each');
      const fx = dlg.querySelector('#fx');
      const money = (c, cur = currency) => fmt(c, cur);

      // --- currency ---
      const drawFx = () => {
        const amt = toCents(form.elements.amount.value);
        fx.textContent = currency === trip.currency ? ''
          : `≈ ${fmt(Math.round(amt * rate), trip.currency)} at today's rate · 1 ${currency} = ${rate.toFixed(4)} ${trip.currency}`;
      };
      form.elements.currency.onchange = async () => {
        currency = form.elements.currency.value;
        dlg.querySelector('#sym').textContent = symbolOf(currency);
        if (currency === trip.currency) { rate = 1; drawFx(); update(); return; }
        fx.textContent = 'Getting today\'s rate…';
        try { rate = await rateTo(currency, trip.currency); }
        catch (err) { toast(err.message, { error: true }); currency = trip.currency; form.elements.currency.value = currency; rate = 1; dlg.querySelector('#sym').textContent = symbolOf(currency); }
        drawFx(); update();
      };

      // --- split modes ---
      const showMode = () => {
        dlg.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
        dlg.querySelector('#split-equal').hidden = mode !== 'equal';
        dlg.querySelector('#split-amounts').hidden = mode !== 'amounts';
        dlg.querySelector('#split-shares').hidden = mode !== 'shares';
        update();
      };
      dlg.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; showMode(); });
      dlg.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
        const w = dlg.querySelector(`[data-weight="${b.dataset.member}"]`);
        w.textContent = Math.max(0, Math.min(20, Number(w.textContent) + Number(b.dataset.step)));
        update();
      });

      // Splits in the entered currency (for the preview) — shares always add up exactly.
      const splitsIn = (amount) => {
        if (mode === 'equal') {
          const ids = [...form.querySelectorAll('[name=split]:checked')].map((c) => c.value);
          return ids.length ? equalShares(amount, ids) : [];
        }
        if (mode === 'shares') {
          const weights = [...dlg.querySelectorAll('[data-weight]')].map((w) => ({ memberId: w.dataset.weight, weight: Number(w.textContent) }))
            .filter((w) => w.weight > 0);
          return weights.length ? weightedShares(amount, weights) : [];
        }
        return [...dlg.querySelectorAll('.split-amt')].map((i) => ({ memberId: i.dataset.member, share: toCents(i.value), weight: toCents(i.value) }))
          .filter((x) => x.share > 0);
      };
      const update = () => {
        const amount = toCents(form.elements.amount.value);
        drawFx();
        if (!amount) { each.textContent = ''; return; }
        const parts = splitsIn(amount);
        if (mode === 'amounts') {
          const left = amount - parts.reduce((s, p) => s + p.share, 0);
          each.innerHTML = left === 0 ? `${icon('check', 'tiny')} Adds up to ${money(amount)}`
            : `<b style="color:var(--${left > 0 ? 'warn' : 'bad'})">${left > 0 ? `${money(left)} left to assign` : `${money(-left)} too much`}</b>`;
        } else if (mode === 'shares') {
          each.textContent = parts.length ? parts.map((p) => `${label(memberById(trip, p.memberId))} ${money(p.share)}`).join(' · ') : 'Give someone at least one share';
        } else {
          each.textContent = parts.length ? `${money(Math.floor(amount / parts.length))} each, split ${parts.length} way${parts.length === 1 ? '' : 's'}` : '';
        }
      };
      form.addEventListener('input', update);
      form.addEventListener('change', update);

      // --- receipt ---
      const slot = dlg.querySelector('#receipt-slot');
      const input = dlg.querySelector('#receipt-input');
      const drawReceipt = () => {
        const src = receiptFile ? URL.createObjectURL(receiptFile) : receipt ? store.photoUrl(receipt.receiptThumb) : null;
        slot.innerHTML = src
          ? `<div class="receipt-preview"><img src="${esc(src)}" alt="Receipt"><button type="button" class="btn btn-xs btn-ghost" data-rm>${icon('x')}Remove</button></div>`
          : `<button type="button" class="btn btn-secondary btn-sm" data-add-receipt>${icon('receipt')}Add a receipt photo</button>`;
        slot.querySelector('[data-add-receipt]')?.addEventListener('click', () => input.click());
        slot.querySelector('[data-rm]')?.addEventListener('click', () => { receipt = null; receiptFile = null; drawReceipt(); });
      };
      input.onchange = () => { if (input.files[0]) { receiptFile = input.files[0]; drawReceipt(); } };
      drawReceipt();

      form.onsubmit = async (e) => {
        e.preventDefault();
        const entered = toCents(form.elements.amount.value);
        if (entered <= 0) return toast('Enter an amount', { error: true });
        const parts = splitsIn(entered);
        if (!parts.length) return toast('Pick who to split with', { error: true });
        if (mode === 'amounts' && parts.reduce((s, p) => s + p.share, 0) !== entered) return toast('The amounts need to add up to the total', { error: true });
        // Everything is stored in the trip's currency; other currencies convert at today's rate.
        const amount = Math.round(entered * rate);
        const splits = currency === trip.currency ? parts
          : weightedShares(amount, parts.map((p) => ({ memberId: p.memberId, weight: p.share })))
            .map((s, i) => ({ ...s, weight: parts[i].weight ?? null }));
        const ok = await busy(dlg.querySelector('.sheet-foot .btn'), async () => {
          if (receiptFile) receipt = await store.uploadReceipt(trip.id, receiptFile);
          const data = {
            description: form.elements.description.value.trim(), amount,
            paidBy: form.querySelector('[name=paidBy]:checked').value,
            splits: splits.map((s) => ({ memberId: s.memberId, share: s.share, weight: mode === 'equal' ? null : s.weight ?? null })),
            extra: {
              ...(exp ? {} : { spentOn: localDay() }),
              splitMode: mode,
              originalCents: currency === trip.currency ? '' : entered,
              originalCurrency: currency === trip.currency ? '' : currency,
              rate: currency === trip.currency ? '' : rate,
              receiptPath: receipt?.receiptPath ?? '', receiptThumb: receipt?.receiptThumb ?? '',
            },
          };
          return exp ? store.updateExpense(trip.id, exp.id, data) : store.addExpense(trip.id, data);
        });
        if (ok) { close(); ctx.refresh(exp ? 'Expense updated' : 'Expense added'); }
      };
      showMode();
      setTimeout(() => form.elements.amount.focus(), 50);
    },
  });
}
