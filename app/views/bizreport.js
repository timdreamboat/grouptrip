// Printable expense report for business trips: a summary, every transaction,
// then each receipt photo full-size. Opens over the app; "Print or save as PDF"
// uses the browser's own print dialog (Save as PDF downloads it).
// Non-organizers only have their own expenses, so theirs is a personal report.
import { esc, icon, fmtRange } from '../ui.js';
import { fmt } from '../money.js';
import * as store from '../store.js';
import { nameOf, CATEGORIES, categoryOf } from './common.js';

const longDay = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export function openReport(ctx) {
  const { trip, isOrg } = ctx;
  const payers = [...new Set(trip.expenses.map((e) => e.paidBy))];
  let person = isOrg ? 'all' : trip.me.id;

  const el = document.createElement('div');
  el.className = 'report-overlay';
  document.body.append(el);
  document.body.classList.add('report-open');
  const close = () => { el.remove(); document.body.classList.remove('report-open'); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);

  const draw = () => {
    el.innerHTML = `
      <div class="report-bar no-print">
        <button class="btn btn-secondary btn-sm" data-close>${icon('x')}Close</button>
        ${isOrg && payers.length > 1 ? `<select class="input report-who" aria-label="Whose expenses">
          <option value="all">Everyone</option>
          ${payers.map((id) => `<option value="${id}" ${id === person ? 'selected' : ''}>${esc(nameOf(trip, id))}</option>`).join('')}
        </select>` : ''}
        <button class="btn btn-primary btn-sm" data-print disabled>${icon('receipt')}<span>Loading receipts…</span></button>
      </div>
      <p class="report-tip no-print">To download, choose <b>Save as PDF</b> in the print window.</p>
      ${reportHTML(trip, person)}`;
    el.scrollTop = 0;
    el.querySelector('[data-close]').onclick = close;
    el.querySelector('.report-who')?.addEventListener('change', (e) => { person = e.target.value; draw(); });
    const btn = el.querySelector('[data-print]');
    btn.onclick = () => window.print();
    // Wait for every receipt so none print blank.
    const imgs = [...el.querySelectorAll('.report img')];
    Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Print or save as PDF';
    });
  };
  draw();
}

function reportHTML(trip, person) {
  const money = (c) => fmt(c, trip.currency);
  const list = trip.expenses
    .filter((e) => person === 'all' || e.paidBy === person)
    .sort((a, b) => (a.spentOn || '').localeCompare(b.spentOn || '') || a.description.localeCompare(b.description));
  const sum = (xs) => xs.reduce((s, e) => s + e.amount, 0);
  const company = list.filter((e) => e.companyPaid);
  const reimbursed = list.filter((e) => !e.companyPaid && e.reimbursed);
  const open = list.filter((e) => !e.companyPaid && !e.reimbursed);
  const cats = CATEGORIES.map(([key, , label]) => ({ label, items: list.filter((e) => (e.category || 'other') === key) }))
    .filter((c) => c.items.length);
  // Number receipts in table order so the table points at the right photo.
  let n = 0;
  const numbered = list.map((e) => ({ e, no: e.receiptPath ? ++n : null }));
  const whoFor = person === 'all' ? 'All team members' : nameOf(trip, person);
  const status = (e) => (e.companyPaid ? 'Company card' : e.reimbursed ? 'Reimbursed' : 'To reimburse');

  return `
    <article class="report">
      <header class="report-head">
        <div>
          <div class="report-kicker">Expense report</div>
          <h1>${esc(trip.name)}</h1>
          <div class="report-meta">${esc([trip.destination, trip.startDate ? fmtRange(trip.startDate, trip.endDate) + ', ' + new Date(`${trip.startDate}T12:00:00`).getFullYear() : ''].filter(Boolean).join(' · '))}</div>
        </div>
        <dl class="report-facts">
          <div><dt>Submitted by</dt><dd>${esc(whoFor)}</dd></div>
          <div><dt>Prepared</dt><dd>${esc(new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</dd></div>
          <div><dt>Currency</dt><dd>${esc(trip.currency)}</dd></div>
        </dl>
      </header>

      <section class="report-totals">
        <div><span>Total spent</span><b>${money(sum(list))}</b></div>
        <div><span>Paid on company card</span><b>${money(sum(company))}</b></div>
        <div><span>Already reimbursed</span><b>${money(sum(reimbursed))}</b></div>
        <div class="due"><span>Still to reimburse</span><b>${money(sum(open))}</b></div>
      </section>

      ${cats.length ? `
      <section>
        <h2>By category</h2>
        <table class="report-table">
          <tbody>${cats.map((c) => `<tr><td>${esc(c.label)}</td><td class="num">${c.items.length}</td><td class="num">${money(sum(c.items))}</td></tr>`).join('')}</tbody>
        </table>
      </section>` : ''}

      <section>
        <h2>Transactions</h2>
        ${list.length ? `
        <div class="report-scroll"><table class="report-table">
          <thead><tr><th>Date</th>${person === 'all' ? '<th>Person</th>' : ''}<th>Description</th><th>Category</th><th>Status</th><th class="num">Amount</th><th>Receipt</th></tr></thead>
          <tbody>${numbered.map(({ e, no }) => `
            <tr>
              <td class="nowrap">${esc(longDay(e.spentOn))}</td>
              ${person === 'all' ? `<td>${esc(nameOf(trip, e.paidBy))}</td>` : ''}
              <td>${esc(e.description)}${e.originalCurrency ? `<div class="small">${esc(fmt(e.originalCents, e.originalCurrency))} at ${Number(e.rate).toFixed(4)}</div>` : ''}</td>
              <td>${esc(categoryOf(e.category)[2])}</td>
              <td>${esc(status(e))}</td>
              <td class="num nowrap">${money(e.amount)}</td>
              <td>${no ? `#${no}` : '<span class="missing">Missing</span>'}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="${person === 'all' ? 5 : 4}">Total</td><td class="num nowrap">${money(sum(list))}</td><td></td></tr></tfoot>
        </table></div>` : '<p>No expenses.</p>'}
      </section>

      ${n ? `
      <section class="report-receipts">
        <h2>Receipts</h2>
        ${numbered.filter((x) => x.no).map(({ e, no }) => `
          <figure class="report-receipt">
            <figcaption><b>#${no}</b> · ${esc(longDay(e.spentOn))} · ${esc(e.description)} · ${esc(money(e.amount))}${person === 'all' ? ` · ${esc(nameOf(trip, e.paidBy))}` : ''}</figcaption>
            <img src="${esc(store.photoUrl(e.receiptPath))}" alt="Receipt #${no}">
          </figure>`).join('')}
      </section>` : ''}
    </article>`;
}
