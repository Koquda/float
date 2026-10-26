export class InputError extends Error { status = 400; }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected an object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, limit = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new InputError(`${name} is required (maximum ${limit} characters).`);
  return value.trim();
}
export function cents(value: unknown, name = 'Amount', allowNegative = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > 100_000_000_000 || (!allowNegative && value < 0)) throw new InputError(`${name} must be integer cents within the supported range.`);
  return value;
}
export function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new InputError(`${name} must be between ${minimum} and ${maximum}.`);
  return value;
}
export function date(value: unknown, name = 'Date'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2200-12-31') throw new InputError(`${name} must be a valid YYYY-MM-DD date.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new InputError(`${name} is not a calendar date.`);
  return value;
}
export function addDays(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00Z`); parsed.setUTCDate(parsed.getUTCDate() + days); return parsed.toISOString().slice(0, 10);
}
export function decimalCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new InputError('Amount must be a positive decimal with at most two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  return cents(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}
export function allowedUrl(value: unknown, kind: 'source' | 'webhook'): string {
  if (value === '') return '';
  const raw = text(value, `${kind} URL`, 2048);
  let url: URL; try { url = new URL(raw); } catch { throw new InputError('Enter a valid HTTPS URL.'); }
  const hosts = kind === 'source' ? ['raw.githubusercontent.com', 'docs.google.com'] : ['hooks.slack.com', 'hooks.zapier.com', 'discord.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.hash) throw new InputError(`${kind} URL must use HTTPS on ${hosts.join(' or ')} with no credentials or fragment.`);
  if (kind === 'webhook' && url.hostname === 'discord.com' && !url.pathname.startsWith('/api/webhooks/')) throw new InputError('Use a Discord webhook URL.');
  return url.href;
}
