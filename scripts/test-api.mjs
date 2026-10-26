import assert from 'node:assert/strict';
const origin=process.env.FLOAT_TEST_URL||'http://localhost:5173';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Tests only run against local demo data.');
const login=await fetch(`${origin}/signin-with-chatgpt?return_to=/`,{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
async function call(path,payload,auth=true){const r=await fetch(`${origin}/api/${path}`,{method:payload?'POST':'GET',headers:{...(auth?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json',Origin:origin}:{})},...(payload?{body:JSON.stringify(payload)}:{})});return{status:r.status,data:await r.json()};}
for(const path of ['state','forecast','action'])assert.equal((await call(path,path==='state'?undefined:{days:30,type:'invoice.paid',id:'inv-northstar'},false)).status,401);
const initial=(await call('state')).data;
assert.equal(initial.invoices.length,6,'Start with untouched local demo data.');
try{
 const baseline=await call('forecast',{days:30});assert.equal(baseline.status,200);assert.equal(baseline.data.points.length,31);
 const delayed=await call('forecast',{days:30,delayDays:14});assert.notDeepEqual(delayed.data.points,baseline.data.points);
 const paid=await call('action',{type:'invoice.paid',id:'inv-northstar',expectedRevision:initial.revision});assert.equal(paid.status,200);assert.equal(paid.data.balanceCents,initial.balanceCents+640000);
 const repeat=await call('action',{type:'invoice.paid',id:'inv-northstar',expectedRevision:paid.data.revision});assert.equal(repeat.data.balanceCents,paid.data.balanceCents);
 const concurrent=await Promise.all([1,2].map(n=>call('action',{type:'invoice.add',expectedRevision:repeat.data.revision,invoice:{client:`API QA ${n}`,description:'Conflict test',amountCents:12345,dueDate:initial.asOf,expectedDate:initial.asOf}})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 const before=(await call('state')).data;
 const invalid=await call('action',{type:'import.csv',csv:'id,client,amount,due_date\nbad,Test,25.00,2026-02-31',expectedRevision:before.revision});assert.equal(invalid.status,400);assert.equal((await call('state')).data.invoices.length,before.invoices.length);
 const csv='id,client,description,amount,due_date,expected_date\napi-roundtrip,API QA,Import test,100.25,2026-11-01,2026-11-03';
 const one=await call('action',{type:'import.csv',csv}),two=await call('action',{type:'import.csv',csv});assert.equal(one.status,200);assert.equal(two.status,200);assert.equal(one.data.invoices.length,two.data.invoices.length);
 assert.equal((await call('state')).data.invoices.find(i=>i.client==='API QA').amountCents,10025);
 assert.ok([401,503].includes((await call('jobs',{})).status));
 console.log('API integration passed: authentication, saved D1 state, scenarios, paid once, real concurrent conflict, atomic invalid CSV, repeat imports, protected jobs.');
}finally{assert.equal((await call('action',{type:'reset.demo'})).status,200);}
