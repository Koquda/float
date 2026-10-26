import type { Action, Invoice, LedgerState, Settings } from './model.ts';
import { csvInvoices } from './csv.ts';
import { demoState } from './demo.ts';
import { addDays, allowedUrl, cents, date, InputError, integer, object, text } from './validation.ts';
export function importInvoices(state: LedgerState, csv: string): number {
  const incoming = csvInvoices(csv, state.asOf);
  const byId = new Map(state.invoices.map(invoice => [invoice.id, invoice]));
  for (const invoice of incoming) {
    const exportedId = invoice.id.slice(4);
    const current = byId.get(exportedId) ?? byId.get(invoice.id);
    const id = current?.id ?? invoice.id;
    if (current?.status === 'open' && invoice.status === 'paid') state.balanceCents = cents(state.balanceCents + invoice.amountCents, 'Cash balance', true);
    byId.set(id, { ...invoice, id, status: current?.status === 'paid' ? 'paid' : invoice.status });
  }
  if (byId.size > 5000) throw new InputError('The ledger supports up to 5,000 invoices.');
  state.invoices = Array.from(byId.values());
  return incoming.length;
}
export function reduceAction(previous: LedgerState, action: Action, id: string, now: string): LedgerState {
  const state = structuredClone(previous);
  switch (action.type) {
    case 'invoice.add': {
      if (state.invoices.length >= 5000) throw new InputError('Invoice limit reached.');
      const input = object(action.invoice ?? action);
      const dueDate = date(input.dueDate, 'Due date');
      const invoice: Invoice = { id, client: text(input.client, 'Client'), description: text(input.description || 'Invoice', 'Description', 500), amountCents: cents(input.amountCents), dueDate, expectedDate: input.expectedDate ? date(input.expectedDate, 'Expected date') : dueDate < state.asOf ? addDays(state.asOf, 7) : dueDate, status: 'open' };
      state.invoices.push(invoice); break;
    }
    case 'invoice.paid': {
      const invoice = state.invoices.find(value => value.id === action.id);
      if (!invoice) throw new InputError('Invoice was not found.');
      if (invoice.status === 'open') { state.balanceCents = cents(state.balanceCents + invoice.amountCents, 'Cash balance', true); invoice.status = 'paid'; }
      break;
    }
    case 'expense.add': {
      if (state.expenses.length >= 1000) throw new InputError('Expense limit reached.');
      const input = object(action.expense ?? action);
      if (input.recurrence !== 'none' && input.recurrence !== 'monthly') throw new InputError('Recurrence must be none or monthly.');
      state.expenses.push({ id, name: text(input.name, 'Name'), amountCents: cents(input.amountCents), date: date(input.date), recurrence: input.recurrence }); break;
    }
    case 'settings.save': {
      const input = object(action.settings);
      const merged = { ...state.settings, ...input };
      if (typeof merged.alertsEnabled !== 'boolean') throw new InputError('Alerts enabled must be true or false.');
      const settings: Settings = { thresholdCents: cents(merged.thresholdCents, 'Cash buffer'), sourceUrl: allowedUrl(merged.sourceUrl, 'source'), importHour: integer(merged.importHour, 'Import hour (UTC)', 0, 23), webhookUrl: allowedUrl(merged.webhookUrl, 'webhook'), alertsEnabled: merged.alertsEnabled };
      state.settings = settings; break;
    }
    case 'balance.set': state.balanceCents = cents(action.balanceCents, 'Cash balance', true); break;
    case 'import.csv': {
      if (typeof action.csv !== 'string') throw new InputError('CSV content is required.');
      const rowCount = importInvoices(state, action.csv);
      state.importRuns.unshift({ id, at: now, status: 'succeeded', rowCount, message: `Imported ${rowCount} invoices. Existing paid invoices stayed paid.` });
      state.importRuns = state.importRuns.slice(0, 30); break;
    }
    case 'reset.demo': return { ...demoState(state.asOf), revision: state.revision };
    default: throw new InputError('Unknown action.');
  }
  return state;
}
