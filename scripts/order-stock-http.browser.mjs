// Real local UI -> Next Server Action HTTP -> authenticated PostgREST -> SQL040.
// No mocked actions. No tokens, passwords, cookies or HTTP bodies in evidence.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { connect, assertCanonicalLocalDatabase } from '../e2e/integration/support/db.ts'
import { validateEnvironment, validateConfig, parseConfigSubset } from './e2e-supabase.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const api = 'http://127.0.0.1:54421'
const tag = `BW-HTTP-${randomUUID()}`
const evidence = { tag, localOnly: true, scenarios: [], cleanup: null }
const users = [], orgs = [], ids = []
const uuid = () => { const id = randomUUID(); ids.push(id); return id }
let capturedAction
let db, barrier, browser, server, app, step = 'safety', external = 0, failure = false
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development',
  OPENAI_API_KEY: '', GEMINI_API_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_ACCESS_TOKEN: '' }
const out = process.env.BLOOMWISE_HTTP_EVIDENCE_DIR
async function save() {
  if (out) { await mkdir(out, { recursive: true }); await writeFile(path.join(out, 'result.json'), JSON.stringify(evidence, null, 2)) }
}
async function poll(fn, timeout = 5000) {
  const end = Date.now() + timeout
  do { const value = await fn(); if (value) return value; await sleep(20) } while (Date.now() < end)
  throw Error('bounded condition not observed')
}
async function state(org) {
  const batches = (await db.query('select id,quantity_in,quantity_remaining from inventory_items where organization_id=$1 order by id', [org])).rows
  const orders = (await db.query('select id,status,stock_written_off,stock_returned from orders where organization_id=$1 order by id', [org])).rows
  const movements = (await db.query('select source_id,inventory_item_id,movement_type,quantity from stock_movements where organization_id=$1 order by source_id,movement_type,inventory_item_id', [org])).rows
  for (const b of batches) {
    assert(b.quantity_remaining >= 0)
    assert.equal(b.quantity_remaining, b.quantity_in + movements.filter(m => m.inventory_item_id === b.id).reduce((n,m) => n + m.quantity, 0))
  }
  for (const o of orders) {
    const wanted = Number((await db.query('select coalesce(sum(i.quantity),0) n from bouquet_items i join bouquets b on b.id=i.bouquet_id where b.order_id=$1', [o.id])).rows[0].n)
    const own = movements.filter(m => m.source_id === o.id)
    assert.equal(own.filter(m => m.movement_type === 'sale').reduce((n,m) => n-m.quantity,0), o.stock_written_off ? wanted : 0)
    assert.equal(own.filter(m => m.movement_type === 'sale_return').reduce((n,m) => n+m.quantity,0), o.stock_returned ? wanted : 0)
    for (const b of batches) for (const kind of ['sale','sale_return']) assert(own.filter(m => m.inventory_item_id === b.id && m.movement_type === kind).length <= 1)
  }
  return { batches, orders, movements }
}
async function fixture(quantity = 10, count = 1) {
  step='fixture'
  const flower = uuid(), batch = uuid(), orders = []
  await db.query("insert into flowers(id,organization_id,name) values($1,$2,$3)", [flower,orgs[0],tag+flower])
  await db.query('insert into inventory_items(id,organization_id,flower_id,cost_price,quantity_in,quantity_remaining) values($1,$2,$3,100,$4,$4)', [batch,orgs[0],flower,quantity])
  for (let i=0;i<count;i++) {
    const order = uuid(), bouquet = uuid(); orders.push(order)
    await db.query("insert into orders(id,organization_id,status,florist_comment) values($1,$2,'ready',$3)", [order,orgs[0],tag])
    await db.query("insert into bouquets(id,order_id,mode,cost_price,sale_price,profit,margin_percent,is_display) values($1,$2,'stock_only',300,600,300,50,false)", [bouquet,order])
    await db.query('insert into bouquet_items(bouquet_id,flower_id,quantity,unit_cost,total_cost) values($1,$2,3,100,300)', [bouquet,flower])
  }
  evidence.ids=ids;await save();return { flower, batch, orders }
}
async function pageFor(user) {
  const ctx = await browser.newContext()
  await ctx.route('**/*', r => {
    if ([app,api].includes(new URL(r.request().url()).origin)) return r.continue()
    external++; return r.abort()
  })
  const page = await ctx.newPage(); page.setDefaultTimeout(60000)
  page.on('dialog', d => d.accept())
  step='login-page';await page.goto(app+'/login')
  page.on('response',r=>{if(new URL(r.url()).pathname==='/auth/v1/token')evidence.authStatus=r.status()})
  step='login-hydration'
  await page.waitForFunction(() => { const f=document.querySelector('form'); return f && Object.keys(f).some(k => k.startsWith('__reactProps$') && typeof f[k].onSubmit === 'function') })
  step='login-fill';await page.locator('#email').fill(user.email); await page.locator('#password').fill(user.password)
  step='login-submit';await page.getByRole('button',{name:'Войти',exact:true}).click();step='login-navigation'; await page.waitForURL(app+'/')
  return page
}
async function open(page, order) {
  await page.goto(`${app}/orders/${order}`)
  await page.getByRole('button',{name:'Отменить',exact:true}).waitFor()
  // Hydration check only; no application internals or auth state read.
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Отменить' && Object.keys(b).some(k => k.startsWith('__reactProps$') && typeof b[k].onClick === 'function')))
}
function action(page, label) {
  const response = page.waitForResponse(r => r.request().method() === 'POST' && !!r.request().headers()['next-action'], {timeout:30000})
  const result = (async () => {
    const r = await response
    if(label==='Списать склад')capturedAction={id:r.request().headers()['next-action'],body:r.request().postData()}
    assert.equal(r.status(),200)
    const body = await r.text() // memory only: do not persist RSC payload
    const match = body.match(/\{"ok":(true|false)(?:,"error":"((?:\\.|[^"\\])*)")?\}/)
    assert(match, 'missing action result')
    // Chromium's CDP body decoder may interpret text/x-component as Windows-1252.
    // Parse only ASCII ok here; assert the actual browser-rendered domain error below.
    return { status:r.status(), ok:match[1]==='true' }
  })()
  result.catch(() => {}) // avoid unhandled rejection while waiting at the barrier
  const clicked = page.getByRole('button',{name:label,exact:true}).click()
  return { result, clicked }
}
async function waiters(pid, n) {
  return poll(async () => {
    const rows = (await db.query(`select pid,usename,state,wait_event_type,wait_event,pg_blocking_pids(pid) blockers,
      case when query like '%write_off_order_stock%' then 'writeoff_rpc'
           when query like '%return_order_stock%' then 'return_rpc'
           when lower(query) like '%update%orders%' then 'cancel_update' else 'other' end operation
      from pg_stat_activity where datname=current_database() and usename='authenticator' and wait_event_type='Lock'`)).rows
    const reaches = (row, seen = new Set()) => row.blockers.some(b => b===pid || (!seen.has(b) && (seen.add(b), rows.some(r => r.pid===b && reaches(r,seen)))))
    const blocked = rows.filter(r => reaches(r))
    if (blocked.length === n) return blocked
    return null
  }, 3500)
}
async function race(name, f, p1, p2, labels, target) {
  step=name
  await open(p1,f.orders[0]); await open(p2,f.orders.at(-1))
  await barrier.query('begin')
  const pid = (await barrier.query('select pg_backend_pid() pid')).rows[0].pid
  // Only rows created by this run; order/batch names are fixed, never user input.
  await barrier.query(target==='batch' ? 'select id from inventory_items where id=$1 for update' : 'select id from orders where id=$1 for update', [target==='batch'?f.batch:f.orders[0]])
  let first, second, overlap
  try {
    first=action(p1,labels[0])
    await waiters(pid,1)
    second=action(p2,labels[1])
    overlap=await waiters(pid,2)
    const expected=labels.map(label=>label==='Списать склад'?'writeoff_rpc':name==='double-return-via-cancel'?'return_rpc':'cancel_update').sort()
    assert.deepEqual(overlap.map(x=>x.operation).sort(),expected);assert.equal(new Set(overlap.map(x=>x.pid)).size,2)
    evidence.lastOverlap={name,barrierPid:pid,overlap};await save()
  } finally { await barrier.query('rollback') }
  await Promise.all([first.clicked,second.clicked])
  const responses = await Promise.all([first.result,second.result])
  const expectedError={'double-writeoff':'Склад уже списан по этому заказу','insufficient-two-orders':'Недостаточно остатка','double-return-via-cancel':'Склад уже был возвращён по этому заказу','cancel-versus-writeoff':'Нельзя списать склад по отменённому заказу'}[name]
  for(let i=0;i<responses.length;i++)if(!responses[i].ok){assert(expectedError);await [p1,p2][i].getByText(expectedError,{exact:name!=='insufficient-two-orders'}).first().waitFor();responses[i].uiError=expectedError}
  const final = await state(orgs[0])
  const record={name,fixture:f,barrierPid:pid,overlap,responses,final}; evidence.scenarios.push(record); await save()
  return record
}
try {
  assert(validateEnvironment(process.env).ok)
  assert(validateConfig(parseConfigSubset(readFileSync(path.join(root,'e2e/supabase/config.toml'),'utf8'))).ok)
  for (const f of ['.env','.env.local','.env.development','.env.development.local']) assert(!existsSync(path.join(root,f)), 'env file refused')
  assert.equal(spawnSync(process.execPath,['scripts/e2e-supabase.mjs','check'],{cwd:root,env,stdio:'pipe'}).status,0)
  const raw=spawnSync('supabase',['--workdir',path.join(root,'e2e'),'status','-o','json'],{env,encoding:'utf8'})
  assert.equal(raw.status,0); const local=JSON.parse(raw.stdout); assert.equal(local.API_URL,api)
  const dbUrl=new URL(local.DB_URL); assert.equal(dbUrl.hostname,'127.0.0.1');assert.equal(dbUrl.port,'54422')
  db=await connect();await assertCanonicalLocalDatabase(db);barrier=await connect();await assertCanonicalLocalDatabase(barrier)
  const defs=(await db.query("select proname,md5(pg_get_functiondef(oid)) hash from pg_proc where pronamespace='public'::regnamespace and proname in ('write_off_order_stock','return_order_stock') order by proname")).rows
  assert.deepEqual(defs,[{proname:'return_order_stock',hash:'7e21ac72f48035579446389ed94e5018'},{proname:'write_off_order_stock',hash:'0a59a3fb2f7435ca60c42672bdd3c0f9'}]);evidence.functions=defs
  const admin=createClient(api,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  for(let i=0;i<2;i++){ const org=uuid();orgs.push(org);await db.query('insert into organizations(id,name) values($1,$2)',[org,tag+i]) }
  for(let i=0;i<3;i++) {
    const u={email:`${tag}-${i}@example.invalid`,password:randomBytes(24).toString('base64url'),org:orgs[i===2?1:0]}
    const r=await admin.auth.admin.createUser({email:u.email,password:u.password,email_confirm:true});assert(!r.error,'fixture auth failed');u.id=r.data.user.id;users.push(u)
    await db.query("update profiles set organization_id=$1,role='florist',is_active=true where id=$2",[u.org,u.id])
  }
  evidence.identities=users.map(u=>({id:u.id,org:u.org,role:'florist'}));evidence.organizations=orgs;await save()
  const port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});app=`http://127.0.0.1:${port}`
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...env,NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:local.ANON_KEY},stdio:'ignore'})
  await poll(async()=>{try{return (await fetch(app+'/login',{signal:AbortSignal.timeout(1500)})).status===200}catch{return false}},120000)
  browser=await chromium.launch({headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']})
  step='login';const p1=await pageFor(users[0]),p2=await pageFor(users[1]),foreign=await pageFor(users[2])
  let f=await fixture();let r=await race('double-writeoff',f,p1,p2,['Списать склад','Списать склад'],'order')
  assert.equal(r.responses.filter(x=>x.ok).length,1);assert.equal(r.final.batches.find(b=>b.id===f.batch).quantity_remaining,7)
  f=await fixture(5,2);r=await race('insufficient-two-orders',f,p1,p2,['Списать склад','Списать склад'],'batch')
  assert.equal(r.responses.filter(x=>x.ok).length,1);assert.equal(r.final.batches.find(b=>b.id===f.batch).quantity_remaining,2)
  f=await fixture();await open(p1,f.orders[0]);{const a=action(p1,'Списать склад');await a.clicked;assert((await a.result).ok)}
  r=await race('double-return-via-cancel',f,p1,p2,['Отменить','Отменить'],'order')
  assert.equal(r.responses.filter(x=>x.ok).length,1);assert.equal(r.final.batches.find(b=>b.id===f.batch).quantity_remaining,10);assert(r.final.orders.find(o=>o.id===f.orders[0]).stock_returned);assert.equal(r.final.orders.find(o=>o.id===f.orders[0]).status,'cancelled')
  f=await fixture();r=await race('writeoff-versus-cancel',f,p1,p2,['Списать склад','Отменить'],'order')
  assert(r.responses.every(x=>x.ok));assert.equal(r.final.batches.find(b=>b.id===f.batch).quantity_remaining,10);assert.deepEqual(r.final.orders.find(o=>o.id===f.orders[0]),{id:f.orders[0],status:'cancelled',stock_written_off:true,stock_returned:true})
  f=await fixture();r=await race('cancel-versus-writeoff',f,p1,p2,['Отменить','Списать склад'],'order')
  assert.equal(r.responses.filter(x=>x.ok).length,1);assert.equal(r.final.batches.find(b=>b.id===f.batch).quantity_remaining,10);assert(!r.final.orders.find(o=>o.id===f.orders[0]).stock_written_off);assert.equal(r.final.orders.find(o=>o.id===f.orders[0]).status,'cancelled')
  f=await fixture();step='lost-response';await open(p1,f.orders[0])
  let releaseLost,rejectLost,intercepted=false;const lost=new Promise((resolve,reject)=>{releaseLost=resolve;rejectLost=reject});lost.catch(()=>{})
  let actionPosts=0;p1.on('request',r=>{if(r.method()==='POST'&&r.headers()['next-action'])actionPosts++})
  const intercept=async route=>{
    const req=route.request();if(intercepted||req.method()!=='POST'||!req.headers()['next-action'])return route.fallback();intercepted=true
    try {
    capturedAction={id:req.headers()['next-action'],body:req.postData()}
    const response=await route.fetch({timeout:15000,maxRetries:0});assert.equal(response.status(),200)
    const beforeReload=await state(orgs[0]);assert(beforeReload.orders.find(o=>o.id===f.orders[0]).stock_written_off)
    await route.abort('connectionreset');releaseLost(beforeReload)
    }catch{rejectLost(Error('lost response interceptor failed'));try{await route.abort()}catch{}}
  };await p1.route('**/*',intercept)
  await p1.getByRole('button',{name:'Списать склад',exact:true}).click();const committed=await Promise.race([lost,sleep(30000).then(()=>{throw Error('lost response timeout')})])
  await p1.reload();await p1.getByText('Склад списан',{exact:true}).first().waitFor();assert.equal(await p1.getByRole('button',{name:'Списать склад',exact:true}).count(),0)
  assert.deepEqual(await state(orgs[0]),committed);assert.equal(actionPosts,1);evidence.scenarios.push({name:step,fixture:f,responseDiscardedAfterCommit:true,actionPosts,recoveredBy:'real page reload + independent DB read, no resubmit',final:committed})
  step='tenant-isolation';const before=await state(orgs[0]);await foreign.goto(`${app}/orders/${f.orders[0]}`);await foreign.getByRole('heading',{name:'Страница не найдена',exact:true}).waitFor();assert.equal(await foreign.getByRole('button',{name:'Списать склад',exact:true}).count(),0)
  const foreignResult=await foreign.evaluate(async ({id,body,url})=>{const r=await fetch(url,{method:'POST',headers:{'next-action':id,'content-type':'text/plain;charset=UTF-8'},body});return {status:r.status,body:await r.text()}},{...capturedAction,url:`${app}/orders/${f.orders[0]}`})
  assert.equal(foreignResult.status,200);assert(foreignResult.body.includes('Заказ не найден'));assert(!foreignResult.body.includes('"ok":true'));assert.deepEqual(await state(orgs[0]),before);evidence.scenarios.push({name:step,foreignPage:'Страница не найдена',foreignAction:'Заказ не найден',unchanged:true})
  assert.equal(external,0);evidence.passed=true
} catch(e) {
  failure=true;evidence.passed=false;evidence.failureLocation=(e.stack??'').split('\n').filter(x=>x.includes('order-stock-http.browser.mjs:')).map(x=>x.match(/order-stock-http.browser.mjs:[0-9:]+/)?.[0]);evidence.failure={step,type:e.name,code:/^[0-9A-Z]{5}$/.test(e.code??'')?e.code:null};console.error('FAIL at',step,'(details suppressed; no secrets)');await save()
} finally {
  await barrier?.query('rollback').catch(()=>{});await barrier?.end()
  await browser?.close();if(server){server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve()},5000).unref()})}
  if(db)try {
    await db.query('begin')
    // Revoke only these synthetic local identities, then exact-tenant fixture cleanup.
    await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[users.map(u=>u.id)])
    await db.query('delete from stock_movements where organization_id=any($1::uuid[])',[orgs])
    await db.query('delete from orders where organization_id=any($1::uuid[])',[orgs])
    await db.query('delete from organizations where id=any($1::uuid[])',[orgs])
    await db.query('delete from auth.users where id=any($1::uuid[])',[users.map(u=>u.id)])
    await db.query('commit')
    const leftovers=(await db.query(`select (select count(*)::int from auth.users where id=any($1::uuid[])) users,(select count(*)::int from auth.sessions where user_id=any($1::uuid[])) sessions,(select count(*)::int from profiles where id=any($1::uuid[])) profiles,(select count(*)::int from organizations where id=any($2::uuid[])) organizations,(select count(*)::int from orders where organization_id=any($2::uuid[])) orders,(select count(*)::int from inventory_items where organization_id=any($2::uuid[])) batches,(select count(*)::int from stock_movements where organization_id=any($2::uuid[])) movements,(select count(*)::int from flowers where organization_id=any($2::uuid[])) flowers,(select count(*)::int from bouquets where id=any($3::uuid[])) bouquets,(select count(*)::int from bouquet_items where bouquet_id=any($3::uuid[])) items,(select count(*)::int from organization_order_counters where organization_id=any($2::uuid[])) counters`,[users.map(u=>u.id),orgs,ids])).rows[0]
    evidence.cleanup=leftovers;assert(Object.values(leftovers).every(n=>n===0))
  }catch{failure=true;evidence.cleanupFailed=true;await db.query('rollback').catch(()=>{})}
  await db?.end();evidence.ids=ids;evidence.externalRequests=external;await save();console.log(JSON.stringify({passed:evidence.passed&&!failure,scenarios:evidence.scenarios.map(s=>s.name),cleanup:evidence.cleanup}));process.exitCode=failure?1:0
}
