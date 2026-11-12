/** Money is stored as safe integer cents. No money is transferred by this app. */
const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD', 'AUD']);
const PROFILES = new Set(['Individual', 'Student', 'Family', 'Roommates', 'Other']);

function integer(value, label = 'Amount', positive = false) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) {
    throw new Error(`${label} must be ${positive ? 'a positive' : 'a non-negative'} safe integer in cents.`);
  }
  return value;
}

function add(a, b) {
  const total = a + b;
  if (!Number.isSafeInteger(total)) throw new Error('The combined amount is too large.');
  return total;
}

/** Accept decimal input without rounding an already imprecise binary fraction. */
export function toCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Enter a valid amount.');
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text) || text.length > 40) {
    throw new Error('Enter a non-negative amount with no more than two decimal places.');
  }
  const [major = '0', fraction = ''] = text.split('.');
  const cents = BigInt(major || '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('This amount is too large.');
  return Number(cents);
}

export function formatMoney(cents, currency = 'USD') {
  if (!Number.isSafeInteger(cents)) throw new Error('Money must be stored in whole cents.');
  if (!CURRENCIES.has(currency)) throw new Error('Unsupported currency.');
  const amount = BigInt(cents), absolute = amount < 0n ? -amount : amount;
  const major = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const digits = new Intl.NumberFormat(undefined, { useGrouping: false });
  const localize = value => [...value].map(digit => digits.format(Number(digit))).join('');
  // BigInt keeps the major amount exact. A negative seed preserves the locale's
  // minus-sign position even for an amount between -99 and -1 cents.
  const seed = amount < 0n ? -(major || 1n) : major;
  return formatter.formatToParts(seed).map(part => {
    if (part.type === 'fraction') return localize(fraction);
    if (part.type === 'integer' && major === 0n && amount < 0n) return localize('0');
    return part.value;
  }).join('');
}

export function monthSummary(transactions, month) {
  let income = 0, expenses = 0;
  for (const tx of transactions) {
    if (!tx.date.startsWith(`${month}-`)) continue;
    integer(tx.amountCents);
    if (tx.type === 'income') income = add(income, tx.amountCents);
    else if (tx.type === 'expense') expenses = add(expenses, tx.amountCents);
  }
  return { income, expenses, balance: add(income, -expenses) };
}

export function categorySpend(transactions, month) {
  const grouped = new Map();
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.date.startsWith(`${month}-`)) continue;
    integer(tx.amountCents);
    grouped.set(tx.category, add(grouped.get(tx.category) || 0, tx.amountCents));
  }
  return Object.fromEntries(grouped);
}

function participantIds(participants) {
  const ids = participants.map(p => typeof p === 'string' ? p : p.id);
  if (!ids.length || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw new Error('Choose at least one unique participant.');
  }
  return ids;
}

/** Any leftover cent goes to the first participants in the selected order. */
export function splitBill(amountCents, participants) {
  integer(amountCents);
  const ids = participantIds(participants);
  const base = Math.floor(amountCents / ids.length), remainder = amountCents % ids.length;
  return Object.fromEntries(ids.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}

export function balances(bills, participants) {
  if (!participants.length) {
    if (bills.length) throw new Error('Bills need participants.');
    return {};
  }
  const ids = participantIds(participants), known = new Set(ids);
  const net = Object.fromEntries(ids.map(id => [id, 0]));
  for (const bill of bills) {
    if (!known.has(bill.paidBy)) throw new Error('A bill references an unknown payer.');
    const shares = splitBill(bill.amountCents, bill.participants);
    if (Object.keys(shares).some(id => !known.has(id))) throw new Error('A bill references an unknown participant.');
    net[bill.paidBy] = add(net[bill.paidBy], bill.amountCents);
    for (const [id, share] of Object.entries(shares)) net[id] = add(net[id], -share);
  }
  return net;
}

/** Deterministic transfers that clear all calculated balances, without executing payments. */
export function settlements(bills, participants) {
  const net = balances(bills, participants);
  const creditors = Object.entries(net).filter(([, amount]) => amount > 0).map(([id, amount]) => ({ id, amount }));
  const debtors = Object.entries(net).filter(([, amount]) => amount < 0).map(([id, amount]) => ({ id, amount: -amount }));
  const result = [];
  let creditorIndex = 0, debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex], debtor = debtors[debtorIndex];
    const amountCents = Math.min(creditor.amount, debtor.amount);
    result.push({ from: debtor.id, to: creditor.id, amountCents });
    creditor.amount -= amountCents; debtor.amount -= amountCents;
    if (creditor.amount === 0) creditorIndex++;
    if (debtor.amount === 0) debtorIndex++;
  }
  return result;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value, label, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new Error('A record ID is invalid.');
  return value;
}

function date(value, optional = false) {
  if (optional && (value === '' || value == null)) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('A date is invalid.');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('A date is invalid.');
  return value;
}

function list(value, label, max, mapper) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} is invalid or too large.`);
  const result = value.map(item => mapper(record(item, label)));
  if (new Set(result.map(item => item.id)).size !== result.length) throw new Error(`${label} contains duplicate IDs.`);
  return result;
}

/** Validate before replacing device data; return only supported, sanitized fields. */
export function validateImport(input) {
  const data = record(input, 'Backup');
  if (data.version !== 1 || typeof data.demo !== 'boolean') throw new Error('This is not a supported Budget Buddy backup.');
  if (!CURRENCIES.has(data.currency) || !PROFILES.has(data.profile)) throw new Error('Backup currency or profile is invalid.');
  const transactions = list(data.transactions, 'Transactions', 50000, tx => {
    if (!['income', 'expense'].includes(tx.type)) throw new Error('A transaction type is invalid.');
    return { id: identifier(tx.id), type: tx.type, name: text(tx.name, 'Transaction name'), amountCents: integer(tx.amountCents, 'Transaction amount', true), category: text(tx.category, 'Category', 60), date: date(tx.date) };
  });
  const budgets = list(data.budgets, 'Budgets', 200, budget => ({ id: identifier(budget.id), category: text(budget.category, 'Budget category', 60), limitCents: integer(budget.limitCents, 'Budget limit', true) }));
  if (new Set(budgets.map(b => b.category)).size !== budgets.length) throw new Error('Each category can have only one budget.');
  const goals = list(data.goals, 'Savings goals', 200, goal => ({ id: identifier(goal.id), name: text(goal.name, 'Goal name'), targetCents: integer(goal.targetCents, 'Goal target', true), savedCents: integer(goal.savedCents, 'Goal savings'), targetDate: date(goal.targetDate, true), color: typeof goal.color === 'string' && /^(?:#[\da-f]{3,8}|mint|green|peach|purple|lilac|blue)$/i.test(goal.color) ? goal.color : '#8dbca3' }));
  const participants = list(data.participants, 'Participants', 100, p => ({ id: identifier(p.id), name: text(p.name, 'Participant name', 60) }));
  const known = new Set(participants.map(p => p.id));
  const bills = list(data.bills, 'Shared bills', 20000, bill => {
    const paidBy = identifier(bill.paidBy);
    if (!known.has(paidBy)) throw new Error('A bill references an unknown payer.');
    if (!Array.isArray(bill.participants) || !bill.participants.length || bill.participants.length > 100) throw new Error('A bill needs participants.');
    const people = bill.participants.map(identifier);
    if (new Set(people).size !== people.length || people.some(id => !known.has(id))) throw new Error('Bill participants must be unique existing people.');
    return { id: identifier(bill.id), title: text(bill.title, 'Bill title'), amountCents: integer(bill.amountCents, 'Bill amount', true), paidBy, participants: people, date: date(bill.date) };
  });
  // Guard against individually valid amounts producing unsafe combined totals.
  transactions.reduce((sum, tx) => add(sum, tx.amountCents), 0);
  bills.reduce((sum, bill) => add(sum, bill.amountCents), 0);
  budgets.reduce((sum, b) => add(sum, b.limitCents), 0);
  goals.reduce((sum, goal) => add(sum, goal.savedCents), 0);
  balances(bills, participants);
  return { version: 1, demo: data.demo, currency: data.currency, profile: data.profile, transactions, budgets, goals, participants, bills };
}
