import test from 'node:test';
import assert from 'node:assert/strict';
import { demoState } from './demo.ts';
import { importSource, checkBreach, deliverAlerts, runDailyJob } from './service.ts';
import { reduceAction } from './ledger.ts';
import type { Repository } from './repository.ts';
import type { LedgerState } from './model.ts';
function memory(state: LedgerState) {
  return { async read() { return structuredClone(state); }, async mutate(change: (value: LedgerState) => LedgerState) { state = change(structuredClone(state)); state.revision++; return structuredClone(state); } } as unknown as Repository;
}
const now='2026-10-26T10:00:00Z';
const csv='id,client,description,amount,due_date\na,Acme,Work,20.00,2026-11-01';
test('connected imports serialize and cannot overwrite a newer uploaded CSV', async () => {
  const state=demoState('2026-10-26'); state.settings.sourceUrl='https://raw.githubusercontent.com/example/data/main/invoices.csv';
  const repo=memory(state), original=globalThis.fetch;
  let finish!: (response: Response) => void; let calls=0;
  globalThis.fetch=(async()=>{calls++;return new Promise<Response>(resolve=>{finish=resolve;});}) as typeof fetch;
  try {
    const pending=importSource(repo,now,undefined,'daily:2026-10-26');
    while(!finish) await new Promise(resolve=>setImmediate(resolve));
    await importSource(repo,now);
    assert.equal(calls,1);
    await repo.mutate(s=>reduceAction(s,{type:'import.csv',csv:csv.replace('20.00','30.00')},'uploaded','2026-10-26T10:00:01Z'));
    finish(new Response(csv)); await pending;
    const result=await repo.read();
    assert.equal(result.invoices.find(i=>i.id==='csv:a')!.amountCents,3000);
    assert.equal(result.importRuns.find(r=>r.jobKey==='daily:2026-10-26')!.status,'skipped');
  } finally {globalThis.fetch=original;}
});
test('scheduled import catches up once per day without duplicate requests', async () => {
  const state=demoState('2026-10-26');state.settings.sourceUrl='https://raw.githubusercontent.com/example/data/main/invoices.csv';
  const repo=memory(state),original=globalThis.fetch;let calls=0;
  globalThis.fetch=(async()=>{calls++;return new Response(csv);}) as typeof fetch;
  try { await runDailyJob(repo,now);await runDailyJob(repo,'2026-10-26T12:00:00Z');assert.equal(calls,1);assert.equal((await repo.read()).importRuns.filter(r=>r.status==='succeeded').length,1); }
  finally {globalThis.fetch=original;}
});
test('alerts deduplicate a breach, record failures, and retry with a stable event ID',async()=>{
 const state=demoState('2026-10-26');state.settings.alertsEnabled=true;state.settings.webhookUrl='https://hooks.slack.com/services/test';
 checkBreach(state,now);checkBreach(state,now);assert.equal(state.alerts.length,1);
 const repo=memory(state),original=globalThis.fetch;const ids:string[]=[];
 globalThis.fetch=(async(_url,init)=>{ids.push(new Headers(init?.headers).get('Idempotency-Key')!);return new Response('',{status:ids.length===1?500:200});}) as typeof fetch;
 try{
  await deliverAlerts(repo,now);let result=await repo.read();assert.equal(result.alerts[0].status,'failed');
  await deliverAlerts(repo,'2026-10-26T11:00:00Z');assert.equal(ids.length,1);
  await deliverAlerts(repo,'2026-10-26T13:00:00Z');result=await repo.read();assert.equal(result.alerts[0].status,'delivered');assert.equal(ids[0],ids[1]);
 }finally{globalThis.fetch=original;}
});
