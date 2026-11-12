import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, formatMoney, monthSummary, categorySpend, splitBill, balances, settlements, validateImport } from '../dist/finance.js';

test('decimal entry preserves cents and rejects lossy precision, exponents and unsafe totals', () => {
  assert.equal(toCents('0.29'), 29);
  assert.equal(toCents(' 12.10 '), 1210);
  assert.equal(toCents('.05'), 5);
  assert.equal(toCents(1.01), 101);
  assert.equal(toCents('0'), 0);
  for (const input of ['1.001', '-2', 'NaN', '1e2', '', '1,200', '90071992547409.92', null]) assert.throws(() => toCents(input));
  assert.match(formatMoney(129, 'USD'), /1\.29/);
});

test('currency formatting preserves the last cent at both safe integer bounds', () => {
  const bound = toCents('90071992547409.91');
  assert.equal(bound, Number.MAX_SAFE_INTEGER);
  assert.match(formatMoney(bound, 'USD'), /90,071,992,547,409\.91/);
  assert.match(formatMoney(-bound, 'USD'), /-.*90,071,992,547,409\.91/);
  assert.match(formatMoney(-1, 'USD'), /-.*0\.01/);
  assert.match(formatMoney(-99, 'EUR'), /-.*0\.99/);
  assert.match(formatMoney(0, 'GBP'), /0\.00/);
});

test('month totals exclude neighbouring months and separate income from spending categories', () => {
  const transactions = [
    { type: 'income', amountCents: 100000, date: '2026-11-01', category: 'Salary' },
    { type: 'expense', amountCents: 2999, date: '2026-11-02', category: 'Food' },
    { type: 'expense', amountCents: 1, date: '2026-11-30', category: 'Food' },
    { type: 'expense', amountCents: 900, date: '2026-10-31', category: 'Food' },
  ];
  assert.deepEqual(monthSummary(transactions, '2026-11'), { income: 100000, expenses: 3000, balance: 97000 });
  assert.deepEqual(categorySpend(transactions, '2026-11'), { Food: 3000 });
});

test('equal splits conserve every cent and deterministically allocate the remainder', () => {
  assert.deepEqual(splitBill(1000, ['a', 'b', 'c']), { a: 334, b: 333, c: 333 });
  assert.deepEqual(splitBill(2, ['a', 'b', 'c']), { a: 1, b: 1, c: 0 });
  assert.throws(() => splitBill(200, []));
  assert.throws(() => splitBill(200, ['a', 'a']));
  assert.throws(() => splitBill(1.1, ['a']));
});

test('multiple shared bills net correctly and suggested transfers settle every balance', () => {
  const people = ['a', 'b', 'c'].map(id => ({ id, name: id }));
  const bills = [
    { amountCents: 1000, paidBy: 'a', participants: ['a', 'b', 'c'] },
    { amountCents: 600, paidBy: 'b', participants: ['b', 'c'] },
  ];
  const net = balances(bills, people);
  assert.deepEqual(net, { a: 666, b: -33, c: -633 });
  const transfers = settlements(bills, people);
  for (const { from, to, amountCents } of transfers) {
    assert.ok(Number.isSafeInteger(amountCents) && amountCents > 0);
    net[from] += amountCents; net[to] -= amountCents;
  }
  assert.deepEqual(net, { a: 0, b: 0, c: 0 });
  assert.deepEqual(settlements([], []), []);
  assert.throws(() => balances([{ amountCents: 1, paidBy: 'nobody', participants: ['a'] }], people));
});

const backup = () => ({ version: 1, demo: false, currency: 'USD', profile: 'Roommates', transactions: [{ id: 't1', type: 'expense', name: 'Lunch', amountCents: 101, category: 'Food', date: '2024-02-29' }], budgets: [{ id: 'b1', category: 'Food', limitCents: 10000 }], goals: [{ id: 'g1', name: 'Trip', targetCents: 20000, savedCents: 100, targetDate: '', color: '#aabbcc' }], participants: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], bills: [{ id: 's1', title: 'Dinner', amountCents: 101, paidBy: 'a', participants: ['a', 'b'], date: '2026-11-01' }] });

test('backup validation keeps supported fields and rejects corrupted or unsafe data atomically', () => {
  const data = backup(); data.extra = 'not kept';
  assert.equal(validateImport(data).extra, undefined);
  assert.equal(validateImport(data).transactions[0].amountCents, 101);
  const mutations = [
    d => { d.transactions[0].date = '2023-02-29'; },
    d => { d.transactions[0].amountCents = 1.5; },
    d => { d.transactions[0].amountCents = -1; },
    d => { d.transactions.push({ ...d.transactions[0] }); },
    d => { d.bills[0].participants = ['a', 'missing']; },
    d => { d.bills[0].participants = ['a', 'a']; },
    d => { d.currency = 'XYZ'; },
    d => { d.participants[0].id = 'a\" onclick=\"evil'; },
  ];
  for (const mutate of mutations) { const d = backup(); mutate(d); assert.throws(() => validateImport(d)); }
});

test('own-key category names cannot modify object prototypes', () => {
  const result = categorySpend([{ type: 'expense', amountCents: 100, date: '2026-11-01', category: '__proto__' }], '2026-11');
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.__proto__, 100);
});

test('aggregate calculations reject unsafe totals instead of rounding', () => {
  const transactions = [Number.MAX_SAFE_INTEGER, 1].map((amountCents, i) => ({ type: 'expense', amountCents, date: '2026-11-01', category: 'Food', id: `t${i}` }));
  assert.throws(() => monthSummary(transactions, '2026-11'), /too large/);
  assert.throws(() => categorySpend(transactions, '2026-11'), /too large/);
  const bills = [Number.MAX_SAFE_INTEGER, 2].map((amountCents, i) => ({ id: `b${i}`, amountCents, paidBy: 'a', participants: ['b'] }));
  assert.throws(() => balances(bills, [{ id: 'a' }, { id: 'b' }]), /too large/);
  const imported = backup(); imported.transactions = transactions.map(t => ({ ...t, name: 'Oversized total' }));
  assert.throws(() => validateImport(imported), /too large/);
});
