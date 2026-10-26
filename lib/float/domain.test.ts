import test from 'node:test';
import assert from 'node:assert/strict';
import { demoState } from './demo.ts';
import { forecast } from './forecast.ts';
import { reduceAction } from './ledger.ts';
import { csvInvoices, parseCsv } from './csv.ts';
import { allowedUrl, date, decimalCents } from './validation.ts';
import { ConflictError, Repository } from './repository.ts';
import type { LedgerState } from './model.ts';
function blank(): LedgerState { return { ...demoState('2026-01-30'), invoices: [], expenses: [], balanceCents: 10000 }; }
test('money uses exact cents and refuses extra precision and exponent syntax', () => {
  assert.equal(decimalCents('12.30'), 1230);
  for (const amount of ['12.345', '1e3', '-10', 'Infinity']) assert.throws(() => decimalCents(amount));
});
test('calendar dates reject impossible days', () => {
  assert.equal(date('2028-02-29'), '2028-02-29');
  assert.throws(() => date('2026-02-29')); assert.throws(() => date('2026-02-31'));
});
test('demo contains six invoices, four costs and a real shortfall within two weeks', () => {
  const state = demoState('2026-10-26'), result = forecast(state);
  assert.equal(state.invoices.length, 6); assert.equal(state.expenses.length, 4);
  assert.ok(result.minimumCents < 0); assert.ok(result.firstTightDate! <= '2026-11-09');
});
test('monthly recurrence clamps February and retains the March anchor', () => {
  const state = blank(); state.expenses = [{ id: 'rent', name: 'Rent', amountCents: 100, date: '2026-01-31', recurrence: 'monthly' }];
  const result = forecast(state, { days: 62 });
  assert.deepEqual(result.points.filter(point => point.expenseCents > 0).map(point => point.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
});
test('overdue receipts normalize to seven days and delays and exclusions apply', () => {
  const state = blank(); state.invoices = [{ id: 'a', client: 'A', description: 'A', amountCents: 2000, dueDate: '2026-01-01', expectedDate: '2026-01-02', status: 'open' }];
  assert.equal(forecast(state).points.find(point => point.incomeCents)!.date, '2026-02-06');
  assert.equal(forecast(state, { delayDays: 3 }).points.find(point => point.incomeCents)!.date, '2026-02-09');
  assert.equal(forecast(state, { excludedInvoiceIds: ['a'] }).receivablesCents, 0);
});
test('collection priority measures minimum uplift from collecting today', () => {
  const state = blank(); state.balanceCents = 1000;
  state.expenses = [{ id: 'e', name: 'Cost', amountCents: 2000, date: '2026-01-31', recurrence: 'none' }];
  state.invoices = [{ id: 'a', client: 'A', description: 'A', amountCents: 1500, dueDate: '2026-01-01', expectedDate: '2026-02-06', status: 'open' }];
  const result = forecast(state, { days: 10 });
  assert.equal(result.minimumCents, -1000); assert.equal(result.priorities[0].impactCents, 1500);
});
test('marking paid adds cash exactly once and excludes future income', () => {
  const state = demoState('2026-10-26');
  const once = reduceAction(state, { type: 'invoice.paid', id: 'inv-northstar' }, 'action', '2026-10-26T12:00:00Z');
  const twice = reduceAction(once, { type: 'invoice.paid', id: 'inv-northstar' }, 'action', '2026-10-26T12:00:00Z');
  assert.equal(once.balanceCents, state.balanceCents + 640000); assert.equal(twice.balanceCents, once.balanceCents);
  assert.equal(forecast(once).receivablesCents, forecast(state).receivablesCents - 640000);
});
test('CSV supports quoted commas, newlines and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"line,one","two\n""three"""\n'), [['a', 'b'], ['line,one', 'two\n"three"']]);
});
test('CSV reruns are idempotent and preserve locally paid invoices', () => {
  const csv = 'id,client,description,amount,due_date,expected_date\na,Acme,Work,20.00,2026-02-01,2026-02-05';
  const imported = reduceAction(blank(), { type: 'import.csv', csv }, 'run1', '2026-01-30T00:00:00Z');
  const paid = reduceAction(imported, { type: 'invoice.paid', id: 'csv:a' }, 'pay', '2026-01-30T00:00:00Z');
  const rerun = reduceAction(paid, { type: 'import.csv', csv }, 'run2', '2026-01-30T00:00:00Z');
  assert.equal(rerun.invoices.length, 1); assert.equal(rerun.invoices[0].status, 'paid'); assert.equal(rerun.balanceCents, 12000);
});
test('CSV rejects the complete batch for invalid dates, duplicate IDs and malformed widths', () => {
  const header = 'id,client,description,amount,due_date\n';
  assert.throws(() => csvInvoices(header + 'a,A,Work,2.00,2026-02-31', '2026-01-01'), /row 2/);
  assert.throws(() => csvInvoices(header + 'a,A,Work,2.00,2026-02-01\na,B,Work,3.00,2026-02-02', '2026-01-01'), /Duplicate/);
  assert.throws(() => csvInvoices(header + 'a,A,Work,2.00', '2026-01-01'), /Column count/);
});
test('outbound destinations only allow configured provider origins', () => {
  assert.equal(allowedUrl('https://raw.githubusercontent.com/example/data/main/data.csv', 'source'), 'https://raw.githubusercontent.com/example/data/main/data.csv');
  for (const url of ['http://raw.githubusercontent.com/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://user:pass@docs.google.com/a', 'https://docs.google.com:8443/a']) assert.throws(() => allowedUrl(url, 'source'));
});
test('forecast rejects invalid scenario bounds', () => {
  assert.throws(() => forecast(blank(), { days: 366 })); assert.throws(() => forecast(blank(), { delayDays: -1 }));
});
test('repository rejects stale edits and retains concurrent successful writes', async () => {
  let stored: { revision: number; state_json: string } | undefined;
  const db = { prepare(sql: string) { return { bind(...values: unknown[]) { return {
    async run() {
      if (sql.startsWith('INSERT')) { stored ||= { revision: 0, state_json: String(values[1]) }; return { meta: { changes: 1 } }; }
      if (stored!.revision !== values[3]) return { meta: { changes: 0 } };
      stored = { revision: Number(values[0]), state_json: String(values[1]) }; return { meta: { changes: 1 } };
    }, async first() { return stored && { ...stored }; },
  }; } }; } } as unknown as D1Database;
  const one = new Repository(db, 'owner', '2026-01-30'), two = new Repository(db, 'owner', '2026-01-30');
  await one.read();
  await Promise.all([one.mutate(state => ({ ...state, balanceCents: state.balanceCents + 1 })), two.mutate(state => ({ ...state, balanceCents: state.balanceCents + 2 }))]);
  assert.equal((await one.read()).balanceCents, 1840003);
  await assert.rejects(one.mutate(state => state, 0), ConflictError);
});
test('collecting today can lift a minimum that occurs at current cash', () => {
  const state = blank(); state.balanceCents = 1000;
  state.invoices = [{ id: 'a', client: 'A', description: 'A', amountCents: 600000, dueDate: '2026-01-01', expectedDate: '2026-02-06', status: 'open' }];
  assert.equal(forecast(state, { days: 10 }).priorities[0].impactCents, 600000);
});
test('exported internal IDs import into existing invoices without duplication', () => {
  const state = demoState('2026-10-26');
  const rows = ['id,client,description,amount,due_date,expected_date,status', ...state.invoices.map(i => [i.id, i.client, 'Exported', (i.amountCents / 100).toFixed(2), i.dueDate, i.expectedDate, i.status].join(','))].join('\n');
  const imported = reduceAction(state, { type: 'import.csv', csv: rows }, 'run', '2026-10-26T12:00:00Z');
  assert.equal(imported.invoices.length, state.invoices.length);
  assert.deepEqual(imported.invoices.map(i => i.id), state.invoices.map(i => i.id));
  const csv = 'id,client,description,amount,due_date\na,Acme,Work,20.00,2026-11-01';
  const first = reduceAction(blank(), { type: 'import.csv', csv }, 'one', '2026-01-30T00:00:00Z');
  const exported = csv.replace('\na,', '\ncsv:a,');
  const second = reduceAction(first, { type: 'import.csv', csv: exported }, 'two', '2026-01-30T00:00:00Z');
  assert.equal(second.invoices.length, 1);
  assert.equal(second.invoices[0].id, 'csv:a');
});
test('an existing CSV invoice paid by its source adds cash once', () => {
  const csv = 'id,client,description,amount,due_date,status\na,Acme,Work,20.00,2026-02-01,open';
  const first = reduceAction(blank(), { type: 'import.csv', csv }, 'one', '2026-01-30T00:00:00Z');
  const paidCsv = csv.replace(',open', ',paid');
  const paid = reduceAction(first, { type: 'import.csv', csv: paidCsv }, 'two', '2026-01-30T00:00:00Z');
  const repeat = reduceAction(paid, { type: 'import.csv', csv: paidCsv }, 'three', '2026-01-30T00:00:00Z');
  assert.equal(paid.balanceCents, 12000); assert.equal(repeat.balanceCents, 12000);
  const historical = reduceAction(blank(), { type: 'import.csv', csv: paidCsv }, 'historical', '2026-01-30T00:00:00Z');
  assert.equal(historical.balanceCents, 10000);
});
test('optimized priorities equal direct collect-today counterfactuals', () => {
  const state = demoState('2026-10-26');
  for (const delayDays of [0, 7, 30, 180]) {
    const base = forecast(state, { days: 60, delayDays });
    for (const priority of base.priorities) {
      const paid = reduceAction(state, { type: 'invoice.paid', id: priority.invoiceId }, 'paid', '2026-10-26T00:00:00Z');
      assert.equal(priority.impactCents, forecast(paid, { days: 60, delayDays }).minimumCents - base.minimumCents);
    }
  }
});
test('supported large ledgers return all overdue priorities', () => {
  const state = blank();
  state.invoices = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), client: 'A', description: 'A', amountCents: 100, dueDate: '2026-01-01', expectedDate: '2026-02-06', status: 'open' as const }));
  assert.equal(forecast(state).priorities.length, 5000);
});
