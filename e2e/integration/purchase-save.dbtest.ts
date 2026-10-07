import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi} from 'vitest'
import {randomUUID,randomBytes} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {writeFileSync,mkdirSync} from 'node:fs'
import {createClient as makeClient,type SupabaseClient} from '@supabase/supabase-js'
import {connect,assertCanonicalLocalDatabase,withAuthenticatedActor} from './support/db'
const state=vi.hoisted(()=>({client:null as unknown}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
const {createPurchase,updatePurchase}=await import('../../app/actions/purchases')
let db:Awaited<ReturnType<typeof connect>>,client:SupabaseClient,admin:SupabaseClient
let org:string,user:string,flower:string
let dropNextReply=false,saveHttpCalls=0
const evidence:{checks:unknown[];cleanup:unknown[]}={checks:[],cleanup:[]}
const artifacts=process.env.BLOOMWISE_PURCHASE_EVIDENCE_DIR
const createInput=()=>({operation_id:randomUUID(),supplier_name:'Local supplier',purchase_date:'2026-10-07',comment:'before',delivery_cost:10,items:[{flower_id:flower,quantity:5,cost_price:100,effective_cost:102,extra_costs:10,delivery_per_unit:2,sale_price:200,expires_at:'2026-10-20',comment:''}]})
async function snapshot(){
 const out:Record<string,unknown>={}
 for(const t of ['suppliers','purchases','inventory_items','stock_movements','flowers'])out[t]=(await db.query(`select to_jsonb(t) as r from public.${t} t where organization_id=$1 order by id`,[org])).rows.map(r=>r.r)
 out.purchase_items=(await db.query('select to_jsonb(i) r from purchase_items i join purchases p on p.id=i.purchase_id where p.organization_id=$1 order by i.id',[org])).rows.map(r=>r.r)
 if((await db.query("select to_regclass('purchase_private.requests') r")).rows[0].r)out.requests=(await db.query('select to_jsonb(t) r from purchase_private.requests t where organization_id=$1 order by operation_id',[org])).rows.map(r=>r.r)
 return out
}
async function fault(table:string,event:string){
 await db.query(`create or replace function public.bw_purchase_test_fail() returns trigger language plpgsql as $$ declare o uuid; begin if TG_TABLE_NAME='purchase_items' then select organization_id into o from public.purchases where id=coalesce(NEW.purchase_id,OLD.purchase_id); else o:=coalesce(NEW.organization_id,OLD.organization_id); end if; if o='${org}'::uuid then raise exception 'BW_LOCAL_INJECTED_FAILURE'; end if; if TG_OP='DELETE' then return OLD; end if; return NEW; end $$`)
 await db.query(`create trigger bw_purchase_test_fail before ${event} on public.${table} for each row execute function public.bw_purchase_test_fail()`)
}
async function clearFault(){for(const t of ['inventory_items','stock_movements','flowers','suppliers','purchases','purchase_items'])await db.query(`drop trigger if exists bw_purchase_test_fail on public.${t}`);await db.query('drop function if exists public.bw_purchase_test_fail()')}
async function editInput(id:string){const rows=(await db.query('select * from purchase_items where purchase_id=$1 order by id',[id])).rows;return {operation_id:randomUUID(),supplier_name:'Changed supplier',purchase_date:'2026-10-08',comment:'after',delivery_cost:20,deleted_item_ids:[] as string[],items:rows.map(r=>({item_id:r.id,inventory_item_id:r.inventory_item_id,flower_id:r.flower_id,cost_price:120,effective_cost:124,extra_costs:20,sale_price:250,expires_at:'2026-10-22',comment:'edited'}))}}
beforeAll(async()=>{
 db=await connect();await assertCanonicalLocalDatabase(db)
 const p=spawnSync('supabase',['--workdir',fileURLToPath(new URL('../',import.meta.url)),'status','--output','json'],{encoding:'utf8'})
 if(p.status!==0)throw Error('local status unavailable')
 const raw=JSON.parse(p.stdout.slice(p.stdout.indexOf('{'),p.stdout.lastIndexOf('}')+1))
 if(raw.API_URL!=='http://127.0.0.1:54421')throw Error('non-local API refused')
 admin=makeClient(raw.API_URL,raw.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 client=makeClient(raw.API_URL,raw.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(...args)=>{const response=await fetch(...args);if(String(args[0]).endsWith('/rpc/save_purchase_atomic')){saveHttpCalls++;if(dropNextReply){dropNextReply=false;await response.arrayBuffer();throw new TypeError('LOCAL_REPLY_DROPPED_AFTER_COMMIT')}}return response}}});state.client=client
})
beforeEach(async()=>{
 dropNextReply=false;saveHttpCalls=0;org=randomUUID();flower=randomUUID();const password=randomBytes(24).toString('base64url'),email=`atomic-${org}@bloomwise.invalid`
 await db.query('insert into organizations(id,name) values($1,$2)',[org,'Local atomic '+org])
 const a=await admin.auth.admin.createUser({email,password,email_confirm:true});if(a.error||!a.data.user)throw Error('local user creation failed');user=a.data.user.id
 await db.query("update profiles set organization_id=$1,role='owner',is_active=true where id=$2",[org,user])
 await db.query("insert into flowers(id,organization_id,name,category,unit,sale_price,is_active) values($1,$2,'Local rose','Срезка','шт',150,true)",[flower,org])
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error('local login failed')
})
afterEach(async()=>{
 await clearFault();await client.auth.signOut({scope:'local'})
 await db.query('begin')
 if((await db.query("select to_regclass('purchase_private.requests') r")).rows[0].r)await db.query('delete from purchase_private.requests where organization_id=$1',[org])
 await db.query('delete from purchase_items where purchase_id in (select id from purchases where organization_id=$1)',[org])
 for(const t of ['stock_movements','inventory_items','purchases','suppliers','flowers'])await db.query(`delete from ${t} where organization_id=$1`,[org])
 await db.query('delete from auth.users where id=$1',[user]);await db.query('delete from organizations where id=$1',[org]);await db.query('commit')
 const s=await snapshot();expect(Object.values(s).every(a=>Array.isArray(a)&&a.length===0)).toBe(true)
 const n=(await db.query('select (select count(*) from auth.users where id=$1)+(select count(*) from organizations where id=$2) n',[user,org])).rows[0].n;expect(Number(n)).toBe(0);evidence.cleanup.push({org,zero:true})
})
afterAll(async()=>{await db?.end();if(artifacts){mkdirSync(artifacts,{recursive:true});writeFileSync(artifacts+'/db-evidence.json',JSON.stringify(evidence,null,2))}})
it('creation rolls back supplier/header/batch when stock movement insertion fails',async()=>{
 const before=await snapshot();await fault('stock_movements','insert');const r=await createPurchase(createInput());const after=await snapshot();evidence.checks.push({case:'create rollback',error:Boolean(r.error),before,after});expect(r.error).toBeTruthy();expect(after).toEqual(before)
})
it('editing rolls back supplier/header/line when batch update fails',async()=>{
 const p=await createPurchase(createInput());expect(p.id).toBeTruthy();const input=await editInput(p.id!);const before=await snapshot();await fault('inventory_items','update');const r=await updatePurchase(p.id!,input);const after=await snapshot();evidence.checks.push({case:'edit rollback',error:Boolean(r.error),before,after});expect(r.error).toBeTruthy();expect(after).toEqual(before)
})
it('same create operation after lost reply returns original purchase without new effects',async()=>{
 const input=createInput();const first=await createPurchase(input);expect(first.id).toBeTruthy();const before=await snapshot();const second=await createPurchase(input);const after=await snapshot();evidence.checks.push({case:'create lost reply replay',sameId:first.id===second.id,before,after});expect(second.id).toBe(first.id);expect(after).toEqual(before)
})
for(const [table,event] of [['suppliers','insert'],['purchases','insert'],['inventory_items','insert'],['purchase_items','insert'],['flowers','update']])it(`create rollback at ${table}`,async()=>{
 const before=await snapshot();await fault(table,event);const r=await createPurchase(createInput());const after=await snapshot();evidence.checks.push({case:`create fault ${table}`,equal:JSON.stringify(before)===JSON.stringify(after)});expect(r.error).toBeTruthy();expect(after).toEqual(before)
})
for(const [table,event] of [['suppliers','insert'],['purchases','update'],['purchase_items','update'],['flowers','update']])it(`edit rollback at ${table}`,async()=>{
 const p=await createPurchase(createInput());const input=await editInput(p.id!);const before=await snapshot();await fault(table,event);const r=await updatePurchase(p.id!,input);const after=await snapshot();evidence.checks.push({case:`edit fault ${table}`,equal:JSON.stringify(before)===JSON.stringify(after)});expect(r.error).toBeTruthy();expect(after).toEqual(before)
})
it('successful edit uses stored batch/flower/quantities and server delivery split',async()=>{
 const p=await createPurchase(createInput());const input=await editInput(p.id!);input.items[0].inventory_item_id=randomUUID();input.items[0].flower_id=randomUUID();input.items[0].effective_cost=999;input.items[0].extra_costs=999
 expect((await updatePurchase(p.id!,input)).error).toBeUndefined()
 const rows=(await db.query('select i.cost_price::text,i.expires_at::text,i.arrived_at::text,pi.extra_costs::text,i.quantity_remaining from inventory_items i join purchase_items pi on pi.inventory_item_id=i.id where i.purchase_id=$1',[p.id])).rows
 expect(rows).toEqual([{cost_price:'124.00',expires_at:'2026-10-22',arrived_at:'2026-10-08',extra_costs:'20.00',quantity_remaining:5}])
 const before=await snapshot();expect((await updatePurchase(p.id!,input)).id).toBe(p.id);expect(await snapshot()).toEqual(before)
})
it('same operation with altered payload rejects without mutation',async()=>{
 const input=createInput();const p=await createPurchase(input);expect(p.id).toBeTruthy();const before=await snapshot();const result=await createPurchase({...input,comment:'different'});expect(result.error).toContain('другими данными');expect(await snapshot()).toEqual(before)
})
it('line deletion compensates once and preserves zero batch and historical movements',async()=>{
 const p=await createPurchase(createInput());const input=await editInput(p.id!);input.deleted_item_ids=input.items.map(i=>i.item_id);input.items=[]
 const before=await snapshot();await fault('inventory_items','update');expect((await updatePurchase(p.id!,input)).error).toBeTruthy();expect(await snapshot()).toEqual(before);await clearFault()
 expect((await updatePurchase(p.id!,input)).error).toBeUndefined();const after=await snapshot();expect((await updatePurchase(p.id!,input)).error).toBeUndefined();expect(await snapshot()).toEqual(after)
 const batch=(await db.query('select quantity_in,quantity_remaining from inventory_items where purchase_id=$1',[p.id])).rows;expect(batch).toEqual([{quantity_in:5,quantity_remaining:0}]);const movements=(await db.query('select movement_type,quantity from stock_movements where source_id=$1 order by quantity',[p.id])).rows;expect(movements).toEqual([{movement_type:'purchase_cancelled',quantity:-5},{movement_type:'purchase',quantity:5}]);expect((after.purchase_items as unknown[]).length).toBe(0)
})
it('used batch deletion rejects before any commit',async()=>{
 const p=await createPurchase(createInput());await db.query('update inventory_items set quantity_remaining=4 where purchase_id=$1',[p.id]);const input=await editInput(p.id!);input.deleted_item_ids=input.items.map(i=>i.item_id);input.items=[];const before=await snapshot();expect((await updatePurchase(p.id!,input)).error).toContain('использована');expect(await snapshot()).toEqual(before)
})
it('omitted or foreign line rejects complete edit without writes',async()=>{
 const p=await createPurchase(createInput());const input=await editInput(p.id!);input.items[0].item_id=randomUUID();const before=await snapshot();expect((await updatePurchase(p.id!,input)).error).toBeTruthy();expect(await snapshot()).toEqual(before)
})
it('concurrent identical HTTP RPC calls overlap on controlled lock and replay one result',async()=>{
 const input=createInput(),blocker=await connect();let one:ReturnType<typeof createPurchase>|undefined,two:ReturnType<typeof createPurchase>|undefined
 try{
  await blocker.query('begin');await blocker.query("select pg_advisory_xact_lock(hashtextextended('purchase-save:'||$1||':'||$2||':'||$3,0))",[org,user,input.operation_id]);const pid=(await blocker.query('select pg_backend_pid() pid')).rows[0].pid
  one=createPurchase(input);two=createPurchase(input)
  let n=0;for(let i=0;i<100;i++){n=Number((await db.query("select count(*) n from pg_stat_activity where $1=ANY(pg_blocking_pids(pid)) and wait_event='advisory'",[pid])).rows[0].n);if(n>=2)break;await new Promise(r=>setTimeout(r,25))}
  expect(n).toBe(2);expect((await client.rpc('purchase_save_status',{p_operation_id:input.operation_id})).data).toEqual({status:'in_progress'})
  await blocker.query('commit');const [a,b]=await Promise.all([one,two]);expect(a.id).toBeTruthy();expect(b.id).toBe(a.id);expect((await db.query('select count(*)::int n from purchases where organization_id=$1',[org])).rows[0].n).toBe(1)
  evidence.checks.push({case:'concurrent HTTP',observedBlockedRequests:n,mechanism:'controller holds same transaction advisory lock; pg_blocking_pids and wait_event=advisory prove two blocked backend requests',samePurchase:a.id===b.id})
 }finally{await blocker.query('rollback');await blocker.end();await Promise.allSettled([one,two].filter(Boolean))}
})
it('another organization and missing auth cannot edit the purchase or read receipt',async()=>{
 const p=await createPurchase(createInput());const input=await editInput(p.id!),before=await snapshot();const otherOrg=randomUUID(),otherUser=randomUUID()
 await db.query('insert into organizations(id,name) values($1,$2)',[otherOrg,'Local foreign']);await db.query("insert into auth.users(id,email) values($1,$2)",[otherUser,`foreign-${otherUser}@bloomwise.invalid`]);await db.query("update profiles set organization_id=$1,role='florist' where id=$2",[otherOrg,otherUser])
 try{
  await expect(withAuthenticatedActor(db,otherUser,otherOrg,async a=>a.query('select public.save_purchase_atomic($1,$2,$3)',[input.operation_id,p.id,JSON.stringify(input)]))).rejects.toThrow('BW_PURCHASE_UNAVAILABLE')
  const status=await withAuthenticatedActor(db,otherUser,otherOrg,async a=>(await a.query('select public.purchase_save_status($1) r',[input.operation_id])).rows[0].r);expect(status).toEqual({status:'absent'});expect(await snapshot()).toEqual(before)
 }finally{await db.query('delete from auth.users where id=$1',[otherUser]);await db.query('delete from organizations where id=$1',[otherOrg])}
 await expect(withAuthenticatedActor(db,randomUUID(),null,async a=>a.query('select public.save_purchase_atomic($1,$2,$3)',[input.operation_id,p.id,JSON.stringify(input)]))).rejects.toThrow('BW_AUTH_REQUIRED')
})
it('current florist permissions are preserved for own-organization save',async()=>{
 await db.query("update profiles set role='florist' where id=$1",[user]);const p=await createPurchase(createInput());expect(p.id).toBeTruthy();expect((await updatePurchase(p.id!,await editInput(p.id!))).error).toBeUndefined()
})

it('lost actual HTTP reply after commit is reconciled without a second save request',async()=>{
 const input=createInput();dropNextReply=true;const r=await createPurchase(input);expect(r.id).toBeTruthy();expect(saveHttpCalls).toBe(1)
 expect((await db.query('select count(*)::int n from purchases where organization_id=$1',[org])).rows[0].n).toBe(1)
 evidence.checks.push({case:'dropped HTTP reply',discardedOnlyAfterFullBody:true,saveRequests:saveHttpCalls,reconciled:Boolean(r.id)})
})

it('legacy line without flower is rejected clearly with a full rollback',async()=>{
 const p=await createPurchase(createInput());const input=await editInput(p.id!);
 await db.query('update purchase_items set flower_id=null where purchase_id=$1',[p.id]);input.items=[];
 const before=await snapshot();expect((await updatePurchase(p.id!,input)).error).toContain('без товара');expect(await snapshot()).toEqual(before)
})

it('lost edit HTTP reply reconciles the committed edit without repeated effects',async()=>{
 const p=await createPurchase(createInput());const input=await editInput(p.id!);saveHttpCalls=0;dropNextReply=true;
 const result=await updatePurchase(p.id!,input);expect(result.id).toBe(p.id);expect(saveHttpCalls).toBe(1);
 const after=await snapshot();expect((await updatePurchase(p.id!,input)).id).toBe(p.id);expect(await snapshot()).toEqual(after)
})
