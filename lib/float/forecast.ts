import type { Forecast, ForecastOptions, LedgerState } from './model.ts';
import { addDays, cents, integer, InputError } from './validation.ts';

function calculate(state: LedgerState, days: number, delayDays: number, excluded: Set<string>): Omit<Forecast, 'priorities'> {
  const end = addDays(state.asOf, days);
  const income = new Map<string, number>();
  const expenses = new Map<string, number>();
  let receivablesCents = 0;
  let payablesCents = 0;
  for (const invoice of state.invoices) {
    if (invoice.status === 'paid' || excluded.has(invoice.id)) continue;
    const expected = invoice.expectedDate || invoice.dueDate;
    const base = expected < state.asOf ? addDays(state.asOf, 7) : expected;
    const receipt = addDays(base, delayDays);
    if (receipt > end) continue;
    income.set(receipt, cents((income.get(receipt) || 0) + invoice.amountCents));
    receivablesCents = cents(receivablesCents + invoice.amountCents);
  }
  for (const expense of state.expenses) {
    const dates: string[] = [];
    if (expense.recurrence === 'none') {
      if (expense.date >= state.asOf && expense.date <= end) dates.push(expense.date);
    } else {
      const anchor = new Date(`${expense.date}T00:00:00Z`);
      const start = new Date(`${state.asOf}T00:00:00Z`);
      let month = Math.max(anchor.getUTCFullYear() * 12 + anchor.getUTCMonth(), start.getUTCFullYear() * 12 + start.getUTCMonth());
      for (let offset = 0; offset <= 13; offset++, month++) {
        const year = Math.floor(month / 12), monthIndex = month % 12;
        const day = Math.min(anchor.getUTCDate(), new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
        const occurrence = new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
        if (occurrence > end) break;
        if (occurrence >= state.asOf && occurrence >= expense.date) dates.push(occurrence);
      }
    }
    for (const occurrence of dates) {
      expenses.set(occurrence, cents((expenses.get(occurrence) || 0) + expense.amountCents));
      payablesCents = cents(payablesCents + expense.amountCents);
    }
  }
  let balance = state.balanceCents;
  let minimumCents = balance;
  let minimumDate = state.asOf;
  let firstTightDate: string | null = balance < state.settings.thresholdCents ? state.asOf : null;
  const points = [];
  for (let i = 0; i <= days; i++) {
    const day = addDays(state.asOf, i);
    const incomeCents = income.get(day) || 0, expenseCents = expenses.get(day) || 0;
    balance = cents(balance + incomeCents - expenseCents, 'Forecast balance', true);
    points.push({ date: day, balanceCents: balance, incomeCents, expenseCents });
    if (balance < minimumCents) { minimumCents = balance; minimumDate = day; }
    if (firstTightDate === null && balance < state.settings.thresholdCents) firstTightDate = day;
  }
  return { points, minimumCents, minimumDate, firstTightDate, receivablesCents, payablesCents };
}
export function forecast(state: LedgerState, options: ForecastOptions = {}): Forecast {
  const days = integer(options.days ?? 60, 'Forecast days', 1, 365);
  const delayDays = integer(options.delayDays ?? 0, 'Delay days', 0, 180);
  if (options.excludedInvoiceIds !== undefined && (!Array.isArray(options.excludedInvoiceIds) || options.excludedInvoiceIds.length > 2000 || options.excludedInvoiceIds.some(id => typeof id !== 'string'))) throw new InputError('Excluded invoices must be a list of invoice IDs.');
  const excluded = new Set(options.excludedInvoiceIds || []);
  const baseline = calculate(state, days, delayDays, excluded);
  const prefixMinimum = [state.balanceCents];
  const suffixMinimum = new Array<number>(baseline.points.length + 1).fill(Infinity);
  for (let i = 0; i < baseline.points.length; i++) prefixMinimum.push(Math.min(prefixMinimum[i], baseline.points[i].balanceCents));
  for (let i = baseline.points.length - 1; i >= 0; i--) suffixMinimum[i] = Math.min(baseline.points[i].balanceCents, suffixMinimum[i + 1]);
  const amounts = new Map(state.invoices.map(invoice => [invoice.id, invoice.amountCents]));
  const priorities = state.invoices.filter(invoice => invoice.status === 'open' && invoice.dueDate < state.asOf && !excluded.has(invoice.id)).map(invoice => {
    const expected = invoice.expectedDate || invoice.dueDate;
    const base = expected < state.asOf ? addDays(state.asOf, 7) : expected;
    const receiptIndex = Math.min(baseline.points.length, Math.round((Date.parse(base) - Date.parse(state.asOf)) / 86_400_000) + delayDays);
    const collectedMinimum = Math.min(cents(prefixMinimum[receiptIndex] + invoice.amountCents, 'Collection balance', true), suffixMinimum[receiptIndex]);
    return { invoiceId: invoice.id, impactCents: collectedMinimum - baseline.minimumCents, daysOverdue: Math.round((Date.parse(state.asOf) - Date.parse(invoice.dueDate)) / 86_400_000) };
  }).sort((a, b) => b.impactCents - a.impactCents || b.daysOverdue - a.daysOverdue || amounts.get(b.invoiceId)! - amounts.get(a.invoiceId)! || a.invoiceId.localeCompare(b.invoiceId));
  return { ...baseline, priorities };
}
