import type { Alert, LedgerState } from './model';
import { forecast } from './forecast.ts';
import { importInvoices } from './ledger.ts';
import { Repository } from './repository.ts';
import { allowedUrl, InputError } from './validation.ts';

export function checkBreach(state: LedgerState, now: string): LedgerState {
  const result = forecast(state, { days: 60 });
  if (result.minimumCents >= state.settings.thresholdCents) { state.breachActive = false; return state; }
  if (!state.settings.alertsEnabled || !state.settings.webhookUrl || state.breachActive) return state;
  state.breachActive = true;
  state.alerts.unshift({ id: crypto.randomUUID(), at: now, status: 'queued', minimumCents: result.minimumCents, minimumDate: result.minimumDate, message: `Cash is projected below your buffer on ${result.firstTightDate}.`, attempts: 0 });
  state.alerts = state.alerts.slice(0, 30);
  return state;
}
async function boundedFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
}
async function sourceCsv(url: string): Promise<string> {
  const response = await boundedFetch(allowedUrl(url, 'source'), { headers: { Accept: 'text/csv,text/plain' } });
  if (!response.ok) throw new InputError(`Source returned HTTP ${response.status}.`);
  if (!response.body) throw new InputError('Source returned no CSV.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      size += result.value.byteLength;
      if (size > 1_000_000) throw new InputError('CSV source exceeds 1 MB.');
      chunks.push(result.value);
    }
  } finally { await reader.cancel(); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}
export async function importSource(repo: Repository, now: string, expectedRevision?: number, jobKey?: string): Promise<LedgerState> {
  const id = crypto.randomUUID();
  let acquired = false;
  let source = '';
  const claimed = await repo.mutate(state => {
    acquired = false;
    if (state.importRuns.some(run => run.status === 'running' && (run.leaseUntil || '') > now)) return state;
    if (jobKey && state.importRuns.some(run => run.jobKey === jobKey && (run.status === 'succeeded' || (run.status === 'running' && (run.leaseUntil || '') > now)))) return state;
    if (!state.settings.sourceUrl) {
      state.importRuns.unshift({ id, at: now, status: 'skipped', rowCount: 0, message: 'Add a CSV source in Settings to enable connected imports.', jobKey });
    } else {
      source = state.settings.sourceUrl; acquired = true;
      state.importRuns.unshift({ id, at: now, status: 'running', rowCount: 0, message: 'Importing connected CSV.', jobKey, leaseUntil: new Date(Date.parse(now) + 120000).toISOString() });
    }
    state.importRuns = state.importRuns.slice(0, 30); return state;
  }, expectedRevision);
  if (!acquired) return claimed;
  try {
    const csv = await sourceCsv(source);
    return await repo.mutate(state => {
      const run = state.importRuns.find(item => item.id === id);
      if (!run || run.status !== 'running') return state;
      if (state.importRuns.slice(0, state.importRuns.findIndex(item => item.id === id)).some(item => item.status === 'succeeded')) {
        run.status = 'skipped'; run.message = 'A newer import already completed.'; delete run.leaseUntil; return state;
      }
      if (state.settings.sourceUrl !== source) throw new InputError('CSV source changed during the import. Run it again.');
      run.rowCount = importInvoices(state, csv); run.status = 'succeeded'; run.message = `Imported ${run.rowCount} invoices from your connected CSV.`; delete run.leaseUntil;
      return checkBreach(state, now);
    });
  } catch (error) {
    return repo.mutate(state => {
      const run = state.importRuns.find(item => item.id === id);
      if (run) { run.status = 'failed'; run.message = error instanceof Error ? error.message : 'Import failed.'; delete run.leaseUntil; }
      return state;
    });
  }
}
export async function deliverAlerts(repo: Repository, now: string): Promise<LedgerState> {
  let claimed: Alert | undefined;
  let url = '';
  await repo.mutate(state => {
    claimed = undefined;
    if (!state.settings.alertsEnabled || !state.settings.webhookUrl) return state;
    const alert = state.alerts.find(item => item.status !== 'delivered' && item.attempts < 5 && (!item.nextAttemptAt || item.nextAttemptAt <= now) && (!item.leaseUntil || item.leaseUntil <= now));
    if (!alert) return state;
    alert.leaseUntil = new Date(Date.parse(now) + 120000).toISOString(); alert.attempts++;
    claimed = structuredClone(alert); url = state.settings.webhookUrl;
    return state;
  });
  if (!claimed) return repo.read();
  const event = claimed as Alert;
  let failure = '';
  try {
    const message = `Float cash buffer alert. Projected minimum: EUR ${(event.minimumCents / 100).toFixed(2)} on ${event.minimumDate}. Event ${event.id}`;
    const hostname = new URL(url).hostname;
    const payload = hostname === 'discord.com' ? { content: message } : { text: message, eventId: event.id };
    const response = await boundedFetch(allowedUrl(url, 'webhook'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': event.id }, body: JSON.stringify(payload) });
    if (!response.ok) failure = `Webhook returned HTTP ${response.status}.`;
    await response.body?.cancel();
  } catch { failure = 'Webhook could not be reached. Check the destination and try again.'; }
  return repo.mutate(state => {
    const alert = state.alerts.find(item => item.id === event.id);
    if (!alert) return state;
    delete alert.leaseUntil;
    if (failure) { alert.status = 'failed'; alert.message = failure; alert.nextAttemptAt = new Date(Date.parse(now) + Math.min(24, 2 ** alert.attempts) * 3600000).toISOString(); }
    else { alert.status = 'delivered'; alert.message = 'Cash buffer alert delivered to your webhook.'; delete alert.nextAttemptAt; }
    return state;
  });
}
export async function runDailyJob(repo: Repository, now: string): Promise<LedgerState> {
  let state = await repo.read();
  if (new Date(now).getUTCHours() >= state.settings.importHour) state = await importSource(repo, now, undefined, `daily:${now.slice(0, 10)}`);
  await repo.mutate(current => checkBreach(current, now));
  return deliverAlerts(repo, now);
}
