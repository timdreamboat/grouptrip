// Money helpers. All amounts are integer cents.

export function toCents(text) {
  const n = Number(String(text).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fmt(cents, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

// Split an amount equally; leftover cents go to the first people so the
// shares always add up to exactly the total.
export function equalShares(amount, memberIds) {
  const base = Math.floor(amount / memberIds.length);
  let extra = amount - base * memberIds.length;
  return memberIds.map((id) => ({ memberId: id, share: base + (extra-- > 0 ? 1 : 0) }));
}

// Split by shares (e.g. a couple = 2): proportional, and the leftover cents
// go to the largest remainders so the shares add up to exactly the total.
export function weightedShares(amount, weights) {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  const raw = weights.map((w) => ({ ...w, exact: (amount * w.weight) / total }));
  const out = raw.map((r) => ({ memberId: r.memberId, weight: r.weight, share: Math.floor(r.exact) }));
  let left = amount - out.reduce((s, o) => s + o.share, 0);
  raw.map((r, i) => ({ i, rem: r.exact - Math.floor(r.exact) }))
    .sort((a, b) => b.rem - a.rem)
    .forEach(({ i }) => { if (left > 0) { out[i].share++; left--; } });
  return out;
}

// Net balance per member: positive = they are owed money.
// Payments marked as paid move money from the payer's side to the receiver's.
export function balances(trip) {
  const bal = Object.fromEntries(trip.members.map((m) => [m.id, 0]));
  for (const e of trip.expenses) {
    bal[e.paidBy] = (bal[e.paidBy] ?? 0) + e.amount;
    for (const s of e.splits) bal[s.memberId] = (bal[s.memberId] ?? 0) - s.share;
  }
  for (const p of trip.settlements ?? []) {
    bal[p.from] = (bal[p.from] ?? 0) + p.amount;
    bal[p.to] = (bal[p.to] ?? 0) - p.amount;
  }
  return bal;
}

// Common currencies for the picker (the rate service supports ~30).
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'JPY', 'AUD', 'CHF', 'CNY', 'HKD', 'SGD', 'NZD', 'SEK', 'NOK', 'DKK',
  'CZK', 'PLN', 'HUF', 'ISK', 'TRY', 'THB', 'KRW', 'INR', 'IDR', 'PHP', 'MYR', 'ZAR', 'BRL', 'ILS'];

// Today's rate: how many trip-currency units one unit of `from` buys.
// Free, keyless (Frankfurter: central-bank reference rates).
export async function rateTo(from, to) {
  if (from === to) return 1;
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`);
  const body = await res.json().catch(() => null);
  const rate = body?.rates?.[to];
  if (!res.ok || !rate) throw new Error(`Couldn't get today's ${from} → ${to} rate. Try again, or enter it in ${to}.`);
  return rate;
}

// Fewest-ish payments to settle up: repeatedly match the biggest debtor
// with the biggest creditor.
export function settleUp(bal) {
  const debtors = [], creditors = [];
  for (const [id, v] of Object.entries(bal)) {
    if (v < 0) debtors.push({ id, v: -v });
    else if (v > 0) creditors.push({ id, v });
  }
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const payments = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    payments.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return payments;
}
