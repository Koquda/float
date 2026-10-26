import type { Invoice } from './model.ts';
import { addDays, date, decimalCents, InputError, text } from './validation.ts';
export function parseCsv(csv: string): string[][] {
  if (new TextEncoder().encode(csv).length > 1_000_000) throw new InputError('CSV must be smaller than 1 MB.');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new InputError('Invalid quote in CSV.');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (char !== ',') {
        if (char === '\r' && csv[i + 1] === '\n') i++;
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw new InputError('Unexpected text after a closing CSV quote.');
      cell += char;
    }
  }
  if (quoted) throw new InputError('Unclosed CSV quote.');
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  if (rows.length > 2001) throw new InputError('CSV supports up to 2,000 invoices.');
  return rows;
}
export function csvInvoices(csv: string, asOf: string): Invoice[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new InputError('CSV needs a header and at least one invoice.');
  const headers = rows[0].map(value => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new InputError('CSV contains duplicate headers.');
  if (!headers.includes('id') && !headers.includes('external_id')) throw new InputError('CSV needs a stable id column.');
  for (const required of ['client', 'description', 'amount', 'due_date']) if (!headers.includes(required)) throw new InputError(`CSV is missing ${required}.`);
  const ids = new Set<string>();
  return rows.slice(1).map((row, index) => {
    try {
      if (row.length !== headers.length) throw new InputError('Column count does not match the header.');
      const record = Object.fromEntries(headers.map((header, i) => [header, row[i].trim()]));
      const externalId = text(record.id || record.external_id, 'ID', 120);
      const id = `csv:${externalId}`;
      if (ids.has(id)) throw new InputError('Duplicate invoice ID.'); ids.add(id);
      const dueDate = date(record.due_date, 'Due date');
      const status = record.status || 'open';
      if (status !== 'open' && status !== 'paid') throw new InputError('Status must be open or paid.');
      return { id, client: text(record.client, 'Client'), description: text(record.description, 'Description', 500), amountCents: decimalCents(record.amount), dueDate, expectedDate: record.expected_date ? date(record.expected_date, 'Expected date') : dueDate < asOf ? addDays(asOf, 7) : dueDate, status };
    } catch (error) { throw new InputError(`CSV row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid row.'}`); }
  });
}
