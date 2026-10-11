// Local-only real forms → Server Actions → Supabase. No user Chrome profile.
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { chromium } from "playwright"

import { assertCanonicalLocalDatabase, connect, withAuthenticatedActor } from "../e2e/integration/support/db.ts"
import {
  parseConfigSubset,
  resolvePaths,
  validateConfig,
  validateEnvironment,
} from "./e2e-supabase.mjs"

// ─── constants ───────────────────────────────────────────────────────────────

/** The only Supabase API endpoint this script will talk to. */
const EXPECTED_API_ORIGIN = "http://127.0.0.1:54421"
const EXPECTED_DB_HOST = "127.0.0.1"
const EXPECTED_DB_PORT = 54422

const CHROME_DEFAULT = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

/**
 * Names the dev server must NOT inherit from a local .env file. Passing them as
 * empty strings is what blocks that: @next/env only fills variables that are
 * undefined, and an empty string is defined.
 */
const NEUTRALIZED_ENV_NAMES = [
  "OPENAI_API_KEY",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_QUALITY",
  "GEMINI_API_KEY",
  "NANO_BANANA_IMAGE_MODEL",
  "NANO_BANANA_IMAGE_SIZE",
  "AI_IMAGE_PROVIDER",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DEV_SERVER_TIMEOUT_MS = 240_000
// Generous on purpose: a dev server compiles each route on first visit.
const PAGE_TIMEOUT_MS = 90_000
const SAVE_TIMEOUT_MS = 120_000

// ─── small helpers ───────────────────────────────────────────────────────────

class Refusal extends Error {
  constructor(failures) {
    super(`REFUSED — PURCHASE-CUSTOMER-LOCAL real browser E2E\n  - ${failures.join("\n  - ")}`)
    this.name = "Refusal"
  }
}

function refuse(failures) {
  throw new Refusal(failures)
}

/** Money as PostgreSQL renders numeric(10,2)::text, so comparisons are exact. */

function pickKey(source, candidates) {
  for (const key of candidates) {
    const value = source[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/**
 * Minimal environment for every child process. Nothing is inherited wholesale:
 * a production value present in this shell must not reach the dev server.
 */
function childEnv(extra = {}) {
  const base = {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: process.env.HOME ?? "",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG: process.env.LANG ?? "en_US.UTF-8",
    NEXT_TELEMETRY_DISABLED: "1",
    CI: "1",
  }
  for (const name of NEUTRALIZED_ENV_NAMES) base[name] = ""
  return { ...base, ...extra }
}

/** Docker-addressing variables the CLI may legitimately need. Never printed. */
function dockerEnv() {
  const forwarded = {}
  for (const name of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"]) {
    if (typeof process.env[name] === "string") forwarded[name] = process.env[name]
  }
  return forwarded
}

// ─── preflight ───────────────────────────────────────────────────────────────

function preflight(repoRoot, configPath) {
  // 1. The shell itself must not be pointed at production.
  const env = validateEnvironment(process.env)
  if (!env.ok) refuse(env.failures)

  // 2. The stack config must be exactly the isolated E2E one.
  let raw
  try {
    raw = readFileSync(configPath, "utf8")
  } catch {
    refuse([`cannot read config at ${configPath}`])
  }
  const config = validateConfig(parseConfigSubset(raw))
  if (!config.ok) refuse(config.failures)

  // 3. The sanctioned wrapper gets the final word on whether the stack is safe.
  const check = spawnSync("npm", ["run", "e2e:db:check"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: childEnv(dockerEnv()),
  })
  if (check.status !== 0) {
    refuse(["`npm run e2e:db:check` refused or failed — fix the stack before running this script"])
  }
}

/**
 * Reads the local stack's endpoints and keys. The JSON is parsed in memory and
 * the keys are returned as values only — they are never logged, never written
 * to the evidence file and never put into a file.
 */
function readLocalStack(workdir) {
  const result = spawnSync("supabase", ["--workdir", workdir, "status", "--output", "json"], {
    encoding: "utf8",
    env: childEnv(dockerEnv()),
  })
  if (result.status !== 0) {
    refuse([
      "`supabase status` failed — start the isolated stack first (npm run e2e:db:start)",
    ])
  }

  const text = result.stdout ?? ""
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) refuse(["could not parse `supabase status --output json`"])

  let status
  try {
    status = JSON.parse(text.slice(start, end + 1))
  } catch {
    refuse(["`supabase status --output json` did not return valid JSON"])
  }

  const apiUrl = pickKey(status, ["API_URL", "api_url"])
  const anonKey = pickKey(status, ["ANON_KEY", "anon_key", "PUBLISHABLE_KEY", "publishable_key"])
  const serviceKey = pickKey(status, [
    "SERVICE_ROLE_KEY",
    "service_role_key",
    "SECRET_KEY",
    "secret_key",
  ])
  const dbUrl = pickKey(status, ["DB_URL", "db_url"])

  const failures = []
  if (!apiUrl) failures.push("status JSON carries no API URL")
  if (!anonKey) failures.push("status JSON carries no anon/publishable key")
  if (!serviceKey) failures.push("status JSON carries no service-role/secret key")
  if (failures.length > 0) refuse(failures)

  const api = new URL(apiUrl)
  if (api.origin !== EXPECTED_API_ORIGIN) {
    refuse([`API endpoint is ${api.origin}, expected exactly ${EXPECTED_API_ORIGIN}`])
  }
  if (dbUrl) {
    const db = new URL(dbUrl)
    if (db.hostname !== EXPECTED_DB_HOST || Number(db.port) !== EXPECTED_DB_PORT) {
      refuse([`database endpoint is ${db.hostname}:${db.port}, expected ${EXPECTED_DB_HOST}:${EXPECTED_DB_PORT}`])
    }
  }

  return { apiOrigin: api.origin, anonKey, serviceKey }
}

async function createAuthUser(apiOrigin, serviceKey, fixture) {
  const response = await fetch(`${apiOrigin}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: fixture.email,
      password: fixture.password,
      // Confirmed on creation: no mail is generated and no inbox is needed.
      email_confirm: true,
    }),
  })
  if (!response.ok) {
    // Status only — the body may echo configuration back at us.
    throw new Error(`local Auth admin create failed with HTTP ${response.status}`)
  }
  const body = await response.json()
  if (!UUID_RE.test(body?.id ?? "")) throw new Error("local Auth admin returned no user id")
  return body.id
}

async function startDevServer(repoRoot, port, apiOrigin, anonKey) {
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--port", String(port), "--hostname", "127.0.0.1"],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv({
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: apiOrigin,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      }),
    },
  )

  // Server output is scanned for the bound URL and then discarded: it can
  // contain request detail and raw errors, which must not be logged.
  let tail = ""
  let announced = null
  const absorb = (chunk) => {
    tail = (tail + chunk.toString()).slice(-8192)
    const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(tail)
    if (match) announced = Number(match[1])
  }
  child.stdout.on("data", absorb)
  child.stderr.on("data", absorb)

  let exited = false
  child.on("exit", () => {
    exited = true
  })
  // Without a listener a spawn error would surface as an uncaught exception and
  // skip the cleanup in `finally`.
  child.on("error", () => {
    exited = true
  })

  const origin = `http://127.0.0.1:${port}`
  const deadline = Date.now() + DEV_SERVER_TIMEOUT_MS
  let ready = false
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(`${origin}/login`, { redirect: "manual", signal: AbortSignal.timeout(30_000) })
      if (response.status < 500) {
        ready = true
        break
      }
    } catch {
      // not listening yet
    }
    await sleep(500)
  }

  if (!ready) {
    await stopDevServer(child)
    refuse([exited ? "the Next dev server exited during startup" : "the Next dev server did not become ready in time"])
  }
  if (announced != null && announced !== port) {
    await stopDevServer(child)
    refuse([`the dev server bound port ${announced} instead of the reserved ${port} — rerun`])
  }

  return { child, origin }
}

async function stopDevServer(child) {
  if (!child || child.exitCode != null) return
  const exited = new Promise((resolve) => child.once("exit", resolve))
  child.kill("SIGTERM")
  const timer = sleep(10_000).then(() => "timeout")
  if ((await Promise.race([exited.then(() => "exited"), timer])) === "timeout") {
    child.kill("SIGKILL")
    await exited
  }
}

const {repoRoot,workdir,configPath}=resolvePaths(import.meta.url)
const evidenceDir=process.env.BLOOMWISE_BROWSER_EVIDENCE_DIR
if(!evidenceDir || !path.isAbsolute(evidenceDir)) refuse(['absolute BLOOMWISE_BROWSER_EVIDENCE_DIR required'])
await mkdir(evidenceDir,{recursive:true})
preflight(repoRoot,configPath)
const {apiOrigin,anonKey,serviceKey}=readLocalStack(workdir)
const tag=randomUUID(), ids=Object.fromEntries(['org','otherOrg','customer','otherCustomer','flower','purchase','item','batch'].map(k=>[k,randomUUID()]))
const fixture={email:`bw-pc-${tag}@bloomwise.invalid`,password:`Bw-${randomBytes(18).toString('base64url')}`}
const evidence={scope:'isolated Chrome → Next Server Actions → local authenticated Supabase; DB independent assertions',ids,checks:[],cleanup:null,result:'incomplete'}
let db,server,browser,page,userId,owned=false
const check=(name,condition,observed)=>{evidence.checks.push({name,pass:Boolean(condition),observed});}
try {
 db=await connect();await assertCanonicalLocalDatabase(db);owned=true
 await db.query('insert into organizations(id,name) values($1,$2)',[ids.org,`bw-pc-${tag}`])
 userId=await createAuthUser(apiOrigin,serviceKey,fixture)
 await db.query("update profiles set organization_id=$1,role='owner',is_active=true where id=$2",[ids.org,userId])
 await db.query('insert into organizations(id,name) values($1,$2)',[ids.otherOrg,`bw-pc-other-${tag}`])
 await db.query('insert into customers(id,organization_id,full_name) values($1,$2,$3)',[ids.otherCustomer,ids.otherOrg,`Other ${tag}`])
 await withAuthenticatedActor(db,userId,ids.org,async actor=>{
  const foreign=await actor.query('select id from customers where id=$1',[ids.otherCustomer]);check('authenticated other-organization customer invisible',foreign.rowCount===0,{visible:foreign.rowCount})
 })
 await db.query('insert into customers(id,organization_id,full_name) values($1,$2,$3)',[ids.customer,ids.org,`Contactless ${tag}`])
 await db.query("insert into flowers(id,organization_id,name,category,unit) values($1,$2,$3,'Срезка','шт')",[ids.flower,ids.org,`Flower ${tag}`])
 await db.query("insert into purchases(id,organization_id,purchase_date,status,total_amount) values($1,$2,'2026-10-01','confirmed',500)",[ids.purchase,ids.org])
 await db.query("insert into inventory_items(id,organization_id,flower_id,purchase_id,arrived_at,expires_at,cost_price,quantity_in,quantity_remaining) values($1,$2,$3,$4,'2026-10-01','2026-10-10',100,5,5)",[ids.batch,ids.org,ids.flower,ids.purchase])
 await db.query("insert into purchase_items(id,purchase_id,inventory_item_id,flower_id,quantity,cost_price,expires_at) values($1,$2,$3,$4,5,100,'2026-10-10')",[ids.item,ids.purchase,ids.batch,ids.flower])
 server=await startDevServer(repoRoot,await freeLoopbackPort(),apiOrigin,anonKey)
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||CHROME_DEFAULT,args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--no-proxy-server','--disable-background-networking','--disable-sync']})
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.route('**/*',r=>[server.origin,apiOrigin].includes(new URL(r.request().url()).origin)?r.continue():r.abort())
 page=await context.newPage();page.setDefaultTimeout(PAGE_TIMEOUT_MS)
 evidence.serverActionPosts=[]
 page.on('response',r=>{if(r.request().method()==='POST'&&r.request().headers()['next-action'])evidence.serverActionPosts.push({path:new URL(r.url()).pathname,status:r.status()})})
 await page.goto(`${server.origin}/login`);await page.locator('#email').fill(fixture.email);await page.locator('#password').fill(fixture.password)
 await page.getByRole('button',{name:'Войти',exact:true}).click();await page.waitForURL(u=>u.pathname!='/login')
 await page.goto(`${server.origin}/orders/new?customer_id=${ids.customer}`)
 await page.getByText('Клиент выбран из базы',{exact:true}).waitFor()
 await page.locator('input[type=number]').first().fill('500')
 await page.getByRole('button',{name:'Создать заказ',exact:true}).click()
 await page.waitForURL(u=>/^\/orders\/[0-9a-f-]{36}$/.test(u.pathname),{timeout:SAVE_TIMEOUT_MS})
 let result=await db.query('select customer_id from orders where organization_id=$1',[ids.org])
 const customers=await db.query('select count(*)::int as n from customers where organization_id=$1',[ids.org])
 check('selected contactless customer reused',result.rows.length===1&&result.rows[0].customer_id===ids.customer&&customers.rows[0].n===1,{orders:result.rows.length,selectedIdMatches:result.rows[0]?.customer_id===ids.customer,customers:customers.rows[0].n})
 // The actual search dropdown must preserve the same ID, not merely display a name.
 await page.goto(`${server.origin}/orders/new`)
 evidence.lastStep='search-name';await page.getByPlaceholder('Анна Иванова').fill(`Contactless ${tag}`)
 evidence.lastStep='select-search-result';await page.getByRole('button',{name:`Contactless ${tag}`,exact:true}).click()
 await page.getByText('Клиент выбран из базы',{exact:true}).waitFor()
 await page.locator('input[type=number]').first().fill('500')
 await page.getByRole('button',{name:'Создать заказ',exact:true}).click()
 await page.waitForURL(u=>/^\/orders\/[0-9a-f-]{36}$/.test(u.pathname),{timeout:SAVE_TIMEOUT_MS})
 result=await db.query('select customer_id from orders where organization_id=$1',[ids.org])
 check('search dropdown reuses selected UUID',result.rows.length===2&&result.rows.every(r=>r.customer_id===ids.customer),{orders:result.rows.length,allMatch:result.rows.every(r=>r.customer_id===ids.customer)})
 evidence.lastStep='search-order-verified'
 // Explicitly editing the selected name clears selection; names are not unique keys.
 await page.goto(`${server.origin}/orders/new?customer_id=${ids.customer}`)
 await page.getByPlaceholder('Анна Иванова').fill(`Different ${tag}`)
 await page.locator('input[type=number]').first().fill('500')
 await page.getByRole('button',{name:'Создать заказ',exact:true}).click()
 await page.waitForURL(u=>/^\/orders\/[0-9a-f-]{36}$/.test(u.pathname),{timeout:SAVE_TIMEOUT_MS})
 result=await db.query('select customer_id from orders where organization_id=$1',[ids.org])
 check('editing selection clears stale customer ID',result.rows.length===3&&result.rows.filter(r=>r.customer_id===ids.customer).length===2,{orders:result.rows.length,originalCustomerOrders:result.rows.filter(r=>r.customer_id===ids.customer).length})
 for(const expiry of ['2026-10-13','','unchanged-null']) {
  await page.goto(`${server.origin}/purchases/${ids.purchase}/edit`)
  await page.locator('input[type=date]').nth(0).fill('2026-10-04')
  if(expiry!=='unchanged-null') await page.locator('input[type=date]').nth(1).fill(expiry)
  else assert.equal(await page.locator('input[type=date]').nth(1).inputValue(),'')
  await page.getByRole('button',{name:'Сохранить',exact:true}).click()
  await page.waitForURL(u=>u.pathname===`/purchases/${ids.purchase}`,{timeout:SAVE_TIMEOUT_MS})
  result=await db.query(`select p.purchase_date::text,pi.expires_at::text as line_expiry,i.arrived_at::text,i.expires_at::text as batch_expiry,i.quantity_in,i.quantity_remaining,(select count(*)::int from stock_movements where organization_id=$2) as movements from purchases p join purchase_items pi on pi.purchase_id=p.id join inventory_items i on i.id=pi.inventory_item_id where p.id=$1`,[ids.purchase,ids.org])
  const r=result.rows[0]
  const expectedExpiry=expiry==='unchanged-null'?null:(expiry||null)
  check(expiry==='unchanged-null'?'reloading null expiry and saving unchanged':expiry?'date and expiry propagate to batch':'clearing expiry propagates to batch',r.purchase_date==='2026-10-04'&&r.arrived_at===r.purchase_date&&r.line_expiry===expectedExpiry&&r.batch_expiry===r.line_expiry&&r.quantity_in===5&&r.quantity_remaining===5&&r.movements===0,r)
 }
 // Real purchase creation with the Server Action reply deliberately dropped after commit.
 await page.goto(`${server.origin}/purchases/new`)
 await page.getByPlaceholder('Введите поставщика...').fill(`Supplier ${tag}`)
 await page.getByText('Выбрать товар',{exact:true}).click()
 await page.getByPlaceholder('Название, категория или SKU...').fill(`Flower ${tag}`)
 await page.getByText(`Flower ${tag}`,{exact:true}).click()
 const row=page.locator('tr').filter({has:page.getByText(`Flower ${tag}`,{exact:true})})
 await row.locator('input[type=number]').nth(0).fill('2')
 await row.locator('input[type=number]').nth(1).fill('100')
 const initialCount=Number((await db.query('select count(*) n from purchases where organization_id=$1',[ids.org])).rows[0].n)
 let dropped=false
 await page.route('**/purchases/new',async route=>{
  if(!dropped&&route.request().method()==='POST'&&route.request().headers()['next-action']){
   const response=await route.fetch();await response.body();dropped=true;await route.abort('failed');return
  }
  await route.continue()
 })
 await page.getByRole('button',{name:'Провести поставку',exact:true}).click()
 await page.getByRole('button',{name:'Проверить результат отправки',exact:true}).waitFor()
 check('unknown response locks save before reconciliation',await page.getByRole('button',{name:'Провести поставку',exact:true}).isDisabled(),{droppedAfterServerResponse:dropped})
 evidence.recoveryBeforeReload={receipts:(await db.query('select count(*)::int n from purchase_private.requests where organization_id=$1',[ids.org])).rows[0].n, purchases:(await db.query('select count(*)::int n from purchases where organization_id=$1',[ids.org])).rows[0].n, operationStored:await page.evaluate(()=>Boolean(sessionStorage.getItem('bw-purchase-save:new')))}
 await page.reload()
 await page.waitForURL(u=>/^\/purchases\/[0-9a-f-]{36}$/.test(u.pathname),{timeout:SAVE_TIMEOUT_MS})
 const recoveredId=new URL(page.url()).pathname.split('/').at(-1)
 const finalCount=Number((await db.query('select count(*) n from purchases where organization_id=$1',[ids.org])).rows[0].n)
 const recovered=(await db.query('select count(*)::int n from purchase_items where purchase_id=$1',[recoveredId])).rows[0].n
 check('reload recovers created purchase without duplicate',dropped&&finalCount===initialCount+1&&recovered===1,{newPurchases:finalCount-initialCount,lines:recovered})
 evidence.result=evidence.checks.every(c=>c.pass)?'PASS':'FAIL'
} catch(error) {
 // Do not persist assertion values, request bodies, headers, links or raw server errors.
 if(page){evidence.recoveryAtFailure=await page.evaluate(()=>({operationStored:Boolean(sessionStorage.getItem('bw-purchase-save:new')),readyState:document.readyState,buttons:Array.from(document.querySelectorAll('button')).filter(b=>/поставку|отправки/.test(b.textContent)).map(b=>({text:b.textContent,disabled:b.disabled}))})).catch(()=>null)}
 evidence.result='ERROR';evidence.error={type:error.name,code:error.code??null,step:evidence.checks.length}
 if(page&&!new URL(page.url()).pathname.includes('login')) await page.screenshot({path:path.join(evidenceDir,'failure.png')}).catch(()=>{})
} finally {
 await browser?.close();await stopDevServer(server?.child)
 if(db&&owned){
  try {
   await db.query('begin')
   await db.query('delete from purchase_private.requests where organization_id=$1',[ids.org])
   for(const table of ['orders','customers','stock_movements','inventory_movements']) await db.query(`delete from ${table} where organization_id=$1`,[ids.org])
   await db.query('delete from purchase_items where purchase_id in(select id from purchases where organization_id=$1)',[ids.org])
   await db.query('delete from inventory_items where organization_id=$1',[ids.org])
   await db.query('delete from purchases where organization_id=$1',[ids.org])
   await db.query('delete from flowers where organization_id=$1',[ids.org])
   await db.query('delete from suppliers where organization_id=$1',[ids.org])
   await db.query('delete from organization_order_counters where organization_id=$1',[ids.org])
   if(userId) await db.query('delete from auth.users where id=$1',[userId])
   await db.query('delete from organizations where id=$1',[ids.org])
   await db.query('delete from customers where id=$1 and organization_id=$2',[ids.otherCustomer,ids.otherOrg])
   await db.query('delete from organizations where id=$1',[ids.otherOrg])
   const zero={}
   for(const table of ['orders','customers','stock_movements','inventory_movements','inventory_items','purchases','flowers','suppliers','profiles','organization_order_counters']) zero[table]=(await db.query(`select count(*)::int n from ${table} where organization_id=$1`,[ids.org])).rows[0].n
   zero.save_requests=(await db.query('select count(*)::int n from purchase_private.requests where organization_id=$1',[ids.org])).rows[0].n
   zero.purchase_items=(await db.query('select count(*)::int n from purchase_items where purchase_id=$1',[ids.purchase])).rows[0].n
   zero.organizations=(await db.query('select count(*)::int n from organizations where id=$1',[ids.org])).rows[0].n
   zero.other_customers=(await db.query('select count(*)::int n from customers where id=$1',[ids.otherCustomer])).rows[0].n
   zero.other_organizations=(await db.query('select count(*)::int n from organizations where id=$1',[ids.otherOrg])).rows[0].n
   zero.auth_users=userId?(await db.query('select count(*)::int n from auth.users where id=$1',[userId])).rows[0].n:0
   assert(Object.values(zero).every(n=>n===0));await db.query('commit');evidence.cleanup={result:'PASS',remaining:zero}
  }catch(e){await db.query('rollback');evidence.cleanup={result:'FAIL',code:e.code??e.name};evidence.result='ERROR'}
 }
 await db?.end();await writeFile(path.join(evidenceDir,'purchase-customer.json'),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({result:evidence.result,checks:evidence.checks,cleanup:evidence.cleanup}))
}
if(evidence.result!=='PASS'||evidence.cleanup?.result!=='PASS')process.exitCode=1
