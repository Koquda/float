import type { LedgerState } from './model.ts';
import { addDays } from './validation.ts';
export function demoState(asOf: string): LedgerState {
  return { revision: 0, balanceCents: 1840000, asOf, currency: 'EUR',
    invoices: [
      { id: 'inv-northstar', client: 'Northstar Studio', description: 'Brand strategy · final milestone', amountCents: 640000, dueDate: addDays(asOf, -12), expectedDate: addDays(asOf, 7), status: 'open' },
      { id: 'inv-arc', client: 'Arc Collective', description: 'Website design · October', amountCents: 420000, dueDate: addDays(asOf, -6), expectedDate: addDays(asOf, 9), status: 'open' },
      { id: 'inv-pollen', client: 'Pollen Goods', description: 'Campaign creative', amountCents: 285000, dueDate: addDays(asOf, -2), expectedDate: addDays(asOf, 12), status: 'open' },
      { id: 'inv-form', client: 'Form & Field', description: 'Design retainer', amountCents: 750000, dueDate: addDays(asOf, 16), expectedDate: addDays(asOf, 18), status: 'open' },
      { id: 'inv-kin', client: 'Kin Coffee', description: 'Packaging project', amountCents: 320000, dueDate: addDays(asOf, 27), expectedDate: addDays(asOf, 29), status: 'open' },
      { id: 'inv-sunday', client: 'Sunday Supply', description: 'September retainer', amountCents: 390000, dueDate: addDays(asOf, -15), expectedDate: addDays(asOf, -15), status: 'paid' },
    ], expenses: [
      { id: 'exp-payroll', name: 'Team payroll', amountCents: 1540000, date: addDays(asOf, 4), recurrence: 'monthly' },
      { id: 'exp-rent', name: 'Studio rent', amountCents: 265000, date: addDays(asOf, 6), recurrence: 'monthly' },
      { id: 'exp-tools', name: 'Software & subscriptions', amountCents: 78000, date: addDays(asOf, 3), recurrence: 'monthly' },
      { id: 'exp-contractor', name: 'Freelance production', amountCents: 620000, date: addDays(asOf, 5), recurrence: 'none' },
    ], settings: { thresholdCents: 500000, sourceUrl: '', importHour: 8, webhookUrl: '', alertsEnabled: false }, importRuns: [], alerts: [], breachActive: false };
}
