// Business trips: expenses are reimbursed by the company, not split.
// Everyone logs what they spent (category, card, receipt); the organizer
// sees the whole team, marks reimbursements, and downloads a spreadsheet.
// Non-organizers only receive their own expenses from the server.
import { esc, icon, avatar, fmtShort, sheet, confirmSheet, busy, toast, emptyState } from '../ui.js';
import { fmt, toCents, rateTo, CURRENCIES } from '../money.js';
import * as store from '../store.js';
import { memberById, nameOf, firstName, CATEGORIES, categoryOf } from './common.js';
import { openReport } from './bizreport.js';

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const outstanding = (e) => !e.companyPaid && !e.reimbursed;

export function render(el, ctx) {
  const { trip, isOrg } = ctx;
  const meId = trip.me.id;
  const money = (c) => fmt(c, trip.currency);
  const list = trip.expenses;
  const total = list.reduce((s, e) => s + e.amount, 0);
  const owed = list.filter(outstanding).reduce((s, e) => s + e.amount, 0);
  const missing = list.filter((e) => !e.receiptPath).length;
  const who = (id) => (id === meId ? 'You' : firstName(nameOf(trip, id)));
  const lastDay = trip.endDate || trip.startDate;
  const ended = Boolean(lastDay) && lastDay < localDay();

  const people = [...new Set(list.map((e) => e.paidBy))].map((id) => {
    const mine = list.filter((e) => e.paidBy === id);
    return { id, total: mine.reduce((s, e) => s + e.amount, 0), open: mine.filter(outstanding) };
  }).sort((a, b) => b.total - a.total);
  const cats = CATEGORIES.map(([key, emoji, label]) => ({ key, emoji, label,
    total: list.filter((e) => (e.category || 'other') === key).reduce((s, e) => s + e.amount, 0) })).filter((c) => c.total);
  const topCat = Math.max(1, ...cats.map((c) => c.total));

  el.innerHTML = `
    <header class="page-head">
      <div><h1 class="display">Expenses</h1><div class="sub">${isOrg ? 'Everything the team spent' : 'What you spent — for reimbursement'}</div></div>
      <div style="display:flex;gap:8px">
        ${list.length ? `<button class="btn btn-secondary btn-sm" data-action="report">${icon('receipt')}Report</button>
          <button class="btn btn-secondary btn-sm" data-action="export">${icon('list')}Spreadsheet</button>` : ''}
        <button class="btn page-action" data-action="add">${icon('plus')}Add expense</button>
      </div>
    </header>

    <div class="stack-lg">
      ${list.length ? `
      <div class="card report-cta">
        <div class="grow"><div class="title">${ended ? "The trip's over — time for the expense report" : 'Expense report'}</div>
          <div class="sub">${isOrg ? 'Every expense' : 'All your expenses'}${ended ? '' : ' so far'}, with receipt photos — print or save as a PDF any time.</div></div>
        <button class="btn btn-primary btn-sm" data-action="report">${icon('receipt')}${ended ? 'Expense report' : 'Download report'}</button>
      </div>` : ''}
      <div class="stat-grid">
        <div class="stat"><div class="num">${money(total)}</div><div class="lbl">${isOrg ? 'Team spend' : 'You spent'}</div></div>
        <div class="stat"><div class="num ${owed ? 'amt neg' : ''}">${money(owed)}</div><div class="lbl">${isOrg ? 'To reimburse' : 'Owed back to you'}</div></div>
      </div>
      ${missing ? `<p class="hint" style="margin:-14px 4px 0">${icon('info', 'tiny')} ${missing} expense${missing === 1 ? ' is' : 's are'} missing a receipt.</p>` : ''}

      ${isOrg && people.length ? `
      <section>
        <div class="section-head"><h2>By person</h2></div>
        <div class="card card-tight rows">
          ${people.map((p) => {
            const open = p.open.reduce((s, e) => s + e.amount, 0);
            return `
            <div class="row">
              ${avatar(memberById(trip, p.id), 36)}
              <div class="grow"><div class="title">${esc(who(p.id))}</div>
                <div class="sub">${money(p.total)} total${open ? ` · <b style="color:var(--bad)">${money(open)} to reimburse</b>` : ' · all settled'}</div></div>
              ${open ? `<button class="btn btn-xs btn-secondary" data-reimburse-all="${p.open.map((e) => e.id).join(',')}" data-name="${esc(who(p.id))}" data-amt="${open}">${icon('check')}Reimbursed</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </section>` : ''}

      ${cats.length ? `
      <section>
        <div class="section-head"><h2>By category</h2></div>
        <div class="card stack" style="gap:10px">
          ${cats.map((c) => `
            <div class="cat-row"><span>${c.emoji} ${esc(c.label)}</span><span class="amt">${money(c.total)}</span>
              <div class="progress"><span style="width:${Math.round((c.total / topCat) * 100)}%"></span></div></div>`).join('')}
        </div>
      </section>` : ''}

      <section>
        <div class="section-head"><h2>${isOrg ? 'All expenses' : 'Your expenses'}</h2><span class="sub">${list.length}</span></div>
        ${list.length ? `<div class="card card-tight rows">
          ${list.map((e) => {
            const [, emoji, label] = categoryOf(e.category);
            const status = e.companyPaid ? ['declined', 'Company card'] : e.reimbursed ? ['going', 'Reimbursed'] : ['maybe', 'To reimburse'];
            const canEdit = isOrg || e.paidBy === meId || e.createdBy === meId;
            return `
            <div class="row">
              ${e.receiptThumb
                ? `<button class="receipt-thumb" data-receipt="${e.id}" aria-label="View receipt"><img src="${esc(store.photoUrl(e.receiptThumb))}" alt=""></button>`
                : `<div class="tl-icon" title="${esc(label)}">${emoji}</div>`}
              <div class="grow">
                <div class="title">${esc(e.description)}</div>
                <div class="sub">${esc(who(e.paidBy))} · ${esc(label)}${e.spentOn ? ` · ${esc(fmtShort(e.spentOn))}` : ''}${e.originalCurrency ? ` · ${esc(fmt(e.originalCents, e.originalCurrency))}` : ''}${e.receiptPath ? '' : ' · <b style="color:var(--warn)">no receipt</b>'}</div>
              </div>
              <div style="text-align:right;display:grid;gap:4px;justify-items:end">
                <div class="amt">${money(e.amount)}</div>
                ${isOrg && !e.companyPaid
                  ? `<button class="pill ${status[0]}" style="border:0;cursor:pointer" data-toggle-reimb="${e.id}" data-done="${!e.reimbursed}" title="Tap to change">${status[1]}</button>`
                  : `<span class="pill ${status[0]}">${status[1]}</span>`}
              </div>
              ${canEdit ? `<div style="display:flex;flex-direction:column">
                <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-edit="${e.id}" aria-label="Edit expense">${icon('pencil')}</button>
                <button class="btn btn-icon btn-xs btn-ghost" style="width:30px" data-del="${e.id}" aria-label="Remove expense">${icon('trash')}</button></div>` : ''}
            </div>`;
          }).join('')}
        </div>` : `<div class="card">${emptyState('receipt', 'No expenses yet',
          'Log what you spend on the trip — snap the receipt and pick a category. The organizer handles reimbursement.',
          `<button class="btn btn-primary" data-action="add">${icon('plus')}Add an expense</button>`)}</div>`}
      </section>
    </div>`;

  el.onclick = async (ev) => {
    const t = ev.target.closest('[data-action],[data-edit],[data-del],[data-receipt],[data-toggle-reimb],[data-reimburse-all]');
    if (!t) return;
    if (t.dataset.action === 'add') return openBizExpense(ctx);
    if (t.dataset.action === 'export') return exportCsv(trip);
    if (t.dataset.action === 'report') return openReport(ctx);
    if (t.dataset.edit) return openBizExpense(ctx, list.find((x) => x.id === t.dataset.edit));
    if (t.dataset.receipt) {
      const x = list.find((y) => y.id === t.dataset.receipt);
      return sheet({ title: x.description, body: `<img class="receipt-full" src="${esc(store.photoUrl(x.receiptPath))}" alt="Receipt">` });
    }
    if (t.dataset.toggleReimb) {
      const done = t.dataset.done === 'true';
      return ctx.run(() => store.setReimbursed(trip.id, [t.dataset.toggleReimb], done), done ? 'Marked reimbursed' : 'Marked as to reimburse');
    }
    if (t.dataset.reimburseAll) {
      const ok = await confirmSheet({ title: `Reimburse ${t.dataset.name}?`,
        message: `Marks ${money(Number(t.dataset.amt))} as paid back. They'll get a notification.`, confirm: 'Mark reimbursed' });
      if (ok) ctx.run(() => store.setReimbursed(trip.id, t.dataset.reimburseAll.split(','), true), 'Marked reimbursed');
      return;
    }
    if (t.dataset.del) {
      const ok = await confirmSheet({ title: 'Remove this expense?', message: "It won't be reimbursed.", confirm: 'Remove', danger: true });
      if (ok) ctx.run(() => store.removeExpense(trip.id, t.dataset.del), 'Expense removed');
    }
  };
}

// Spreadsheet for expense reports (opens in Excel, Numbers, Google Sheets).
function exportCsv(trip) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const amt = (c) => (c / 100).toFixed(2);
  const rows = [['Date', 'Person', 'Description', 'Category', `Amount (${trip.currency})`, 'Original amount', 'Original currency',
    'Paid with', 'Status', 'Receipt']];
  for (const e of trip.expenses) {
    rows.push([e.spentOn, nameOf(trip, e.paidBy), e.description, categoryOf(e.category)[2], amt(e.amount),
      e.originalCurrency ? amt(e.originalCents) : '', e.originalCurrency || '',
      e.companyPaid ? 'Company card' : 'Personal card', e.companyPaid ? '' : e.reimbursed ? 'Reimbursed' : 'To reimburse',
      e.receiptPath ? store.photoUrl(e.receiptPath) : '']);
  }
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${trip.name.replace(/[^\w\- ]+/g, '').trim() || 'trip'} expenses.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Spreadsheet downloaded');
}

const symbolOf = (currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0)
  .find((p) => p.type === 'currency')?.value ?? currency;

// Add or edit a business expense: amount (any currency), category, card, date, receipt.
export function openBizExpense(ctx, exp = null) {
  const { trip, isOrg } = ctx;
  let currency = exp?.originalCurrency || trip.currency;
  let rate = exp?.rate ? Number(exp.rate) : 1;
  let receipt = exp?.receiptPath ? { receiptPath: exp.receiptPath, receiptThumb: exp.receiptThumb } : null;
  let receiptFile = null;
  const entered = exp ? (exp.originalCents ?? exp.amount) : 0;
  const currencies = [...new Set([trip.currency, ...CURRENCIES])];
  const people = trip.members.filter((m) => m.joined);
  const payer = exp?.paidBy ?? trip.me.id;

  sheet({
    title: exp ? 'Edit expense' : 'Add an expense',
    body: `
      <form class="form" id="biz-form">
        <div class="amount-input">
          <select name="currency" class="currency-pick" aria-label="Currency">
            ${currencies.map((c) => `<option value="${c}" ${c === currency ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <span id="sym">${esc(symbolOf(currency))}</span>
          <input name="amount" inputmode="decimal" placeholder="0" required autocomplete="off" aria-label="Amount" value="${exp ? (entered / 100).toFixed(2) : ''}">
        </div>
        <p class="hint" id="fx" style="text-align:center"></p>
        <label class="field"><span>What was it?</span><input name="description" required maxlength="200" placeholder="Taxi to the venue, client lunch…" value="${esc(exp?.description ?? '')}"></label>
        <div class="field"><span>Category</span><div class="picks">
          ${CATEGORIES.map(([k, emoji, label]) => `<label><input type="radio" name="category" value="${k}" ${(exp?.category || 'meals') === k ? 'checked' : ''}>
            <span class="pick" style="padding-left:12px">${emoji} ${esc(label)}</span></label>`).join('')}</div></div>
        <div class="field"><span>Paid with</span>
          <div class="segmented" role="group">
            <button type="button" data-card="personal" class="${exp?.companyPaid ? '' : 'on'}">My card — reimburse me</button>
            <button type="button" data-card="company" class="${exp?.companyPaid ? 'on' : ''}">Company card</button>
          </div></div>
        <div class="grid-2">
          <label class="field"><span>Date</span><input type="date" name="spentOn" value="${esc(exp?.spentOn || localDay())}"></label>
          ${isOrg ? `<label class="field"><span>Spent by</span><select name="paidBy">
            ${people.map((m) => `<option value="${m.id}" ${m.id === payer ? 'selected' : ''}>${esc(m.id === trip.me.id ? 'Me' : m.name)}</option>`).join('')}
          </select></label>` : ''}
        </div>
        <div class="field"><span>Receipt</span><div id="receipt-slot"></div><input type="file" accept="image/*" id="receipt-input" hidden></div>
      </form>`,
    foot: `<button class="btn btn-primary btn-lg" form="biz-form">${exp ? 'Save changes' : 'Add expense'}</button>`,
    onMount(dlg, close) {
      const form = dlg.querySelector('#biz-form');
      const fx = dlg.querySelector('#fx');
      let company = Boolean(exp?.companyPaid);
      dlg.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => {
        company = b.dataset.card === 'company';
        dlg.querySelectorAll('[data-card]').forEach((x) => x.classList.toggle('on', x === b));
      });
      const drawFx = () => {
        const amt = toCents(form.elements.amount.value);
        fx.textContent = currency === trip.currency ? '' : `≈ ${fmt(Math.round(amt * rate), trip.currency)} · 1 ${currency} = ${rate.toFixed(4)} ${trip.currency}`;
      };
      form.elements.amount.addEventListener('input', drawFx);
      form.elements.currency.onchange = async () => {
        currency = form.elements.currency.value;
        dlg.querySelector('#sym').textContent = symbolOf(currency);
        if (currency === trip.currency) { rate = 1; return drawFx(); }
        fx.textContent = "Getting today's rate…";
        try { rate = await rateTo(currency, trip.currency); }
        catch (err) { toast(err.message, { error: true }); currency = trip.currency; form.elements.currency.value = currency; rate = 1; dlg.querySelector('#sym').textContent = symbolOf(currency); }
        drawFx();
      };
      drawFx();

      const slot = dlg.querySelector('#receipt-slot');
      const input = dlg.querySelector('#receipt-input');
      const drawReceipt = () => {
        const src = receiptFile ? URL.createObjectURL(receiptFile) : receipt ? store.photoUrl(receipt.receiptThumb) : null;
        slot.innerHTML = src
          ? `<div class="receipt-preview"><img src="${esc(src)}" alt="Receipt"><button type="button" class="btn btn-xs btn-ghost" data-rm>${icon('x')}Remove</button></div>`
          : `<button type="button" class="btn btn-secondary btn-sm" data-add-receipt>${icon('receipt')}Snap or add the receipt</button>`;
        slot.querySelector('[data-add-receipt]')?.addEventListener('click', () => input.click());
        slot.querySelector('[data-rm]')?.addEventListener('click', () => { receipt = null; receiptFile = null; drawReceipt(); });
      };
      input.onchange = () => { if (input.files[0]) { receiptFile = input.files[0]; drawReceipt(); } };
      drawReceipt();

      form.onsubmit = async (e) => {
        e.preventDefault();
        const typed = toCents(form.elements.amount.value);
        if (typed <= 0) return toast('Enter an amount', { error: true });
        const amount = Math.round(typed * rate);
        const paidBy = form.elements.paidBy?.value || payer;
        const ok = await busy(dlg.querySelector('.sheet-foot .btn'), async () => {
          if (receiptFile) receipt = await store.uploadReceipt(trip.id, receiptFile);
          const data = {
            description: form.elements.description.value.trim(), amount, paidBy,
            splits: [{ memberId: paidBy, share: amount }], // not split — the company pays it back
            extra: {
              splitMode: 'equal', spentOn: form.elements.spentOn.value,
              category: form.querySelector('[name=category]:checked')?.value || 'other', companyPaid: company,
              originalCents: currency === trip.currency ? '' : typed,
              originalCurrency: currency === trip.currency ? '' : currency,
              rate: currency === trip.currency ? '' : rate,
              receiptPath: receipt?.receiptPath ?? '', receiptThumb: receipt?.receiptThumb ?? '',
            },
          };
          return exp ? store.updateExpense(trip.id, exp.id, data) : store.addExpense(trip.id, data);
        });
        if (ok) { close(); ctx.refresh(exp ? 'Expense updated' : receipt ? 'Expense added' : 'Expense added — add the receipt when you can'); }
      };
      setTimeout(() => form.elements.amount.focus(), 50);
    },
  });
}
