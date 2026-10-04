import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Client } from 'pg'
import { connect, assertCanonicalLocalDatabase } from './support/db'

// All RPCs run as authenticated, with a verified synthetic florist identity.
// Administration/observation connections never execute stock RPCs.
let observer: Client, first: Client, second: Client
let org: string, user: string, foreignOrg: string, foreignUser: string, flower: string
let firstPid: number, secondPid: number
let evidence: Record<string, unknown>
const ids: string[] = []
const id = () => { const v = randomUUID(); ids.push(v); return v }
async function actor(c: Client, uid = user, tenant = org) {
  await c.query('begin')
  await c.query("set local statement_timeout = '8000ms'")
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid])
  await c.query('set local role authenticated')
  const identity = (await c.query('select current_user as role, auth.uid() as uid, get_user_organization_id() as org')).rows[0]
  expect(identity).toEqual({role:'authenticated',uid,org:tenant})
}
async function batch(quantity: number) {
  const v=id()
  await observer.query('insert into inventory_items(id,organization_id,flower_id,cost_price,quantity_in,quantity_remaining) values($1,$2,$3,100,$4,$4)',[v,org,flower,quantity]); return v
}
async function order(quantity=3, tenant=org, bloom=flower) {
  const v=id(), b=id()
  await observer.query("insert into orders(id,organization_id,status) values($1,$2,'ready')",[v,tenant])
  await observer.query("insert into bouquets(id,order_id,mode,cost_price,sale_price,profit,margin_percent,is_display) values($1,$2,'stock_only',300,600,300,50,false)",[b,v])
  await observer.query('insert into bouquet_items(bouquet_id,flower_id,quantity,unit_cost,total_cost) values($1,$2,$3,100,$3*100)',[b,bloom,quantity]);return v
}
const allocation=(b:string,q=3)=>({inventory_item_id:b,flower_id:flower,quantity:q})
async function write(c:Client,o:string,a:ReturnType<typeof allocation>[]) {return c.query('select write_off_order_stock($1,$2::jsonb)',[o,JSON.stringify(a)])}
async function refund(c:Client,o:string) {return c.query('select return_order_stock($1)',[o])}
async function outcome(p:Promise<unknown>) {try {await p; return {ok:true}}catch(e){ const err=e as Error & {code:string};return {ok:false,code:err.code,message:err.message}}}
// Poll only for a proven lock dependency (bounded). The held transaction is the
// barrier; polling delays are not the synchronization mechanism.
async function blocked() {
  const deadline=Date.now()+4000
  while(Date.now()<deadline) {
    const rows=(await observer.query(`select pid,state,wait_event_type,wait_event,backend_xid::text,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=any($1::int[]) order by pid`,[[firstPid,secondPid]])).rows
    const waiter=rows.find(r=>r.pid===secondPid)
    if(waiter?.wait_event_type==='Lock' && waiter.blockers.includes(firstPid)) {
      evidence.overlap={activity:rows,locks:(await observer.query('select pid,locktype,relation::regclass::text,mode,granted from pg_locks where pid=any($1::int[])',[[firstPid,secondPid]])).rows};return
    }
    await new Promise(r=>setTimeout(r,20))
  }
  throw Error('No observed overlapping lock dependency; refusing timing-only proof')
}
async function state() {
  const snapshot={
    batches:(await observer.query('select id,quantity_in,quantity_remaining from inventory_items where organization_id=$1 order by id',[org])).rows,
    orders:(await observer.query('select id,status,stock_written_off,stock_returned from orders where organization_id=$1 order by id',[org])).rows,
    movements:(await observer.query('select source_id,inventory_item_id,movement_type,quantity from stock_movements where organization_id=$1 order by source_id,movement_type,inventory_item_id',[org])).rows,
  }
  evidence.final=snapshot
  // Independent conservation per batch, plus nonnegative stock.
  for(const b of snapshot.batches) {
    expect(b.quantity_remaining).toBeGreaterThanOrEqual(0)
    expect(b.quantity_remaining).toBe(b.quantity_in+snapshot.movements.filter(m=>m.inventory_item_id===b.id).reduce((n,m)=>n+m.quantity,0))
  }
  for (const o of snapshot.orders) {
    const wanted = Number((await observer.query('select coalesce(sum(i.quantity),0) quantity from bouquet_items i join bouquets b on b.id=i.bouquet_id where b.order_id=$1',[o.id])).rows[0].quantity)
    const movements = snapshot.movements.filter(m=>m.source_id===o.id)
    expect(movements.filter(m=>m.movement_type==='sale').reduce((n,m)=>n-m.quantity,0)).toBe(o.stock_written_off?wanted:0)
    expect(movements.filter(m=>m.movement_type==='sale_return').reduce((n,m)=>n+m.quantity,0)).toBe(o.stock_returned?wanted:0)
    for (const b of snapshot.batches) {
      for (const kind of ['sale','sale_return']) expect(movements.filter(m=>m.inventory_item_id===b.id && m.movement_type===kind).length).toBeLessThanOrEqual(1)
    }
  }
  return snapshot
}
beforeEach(async ctx=>{
  observer=await connect();await assertCanonicalLocalDatabase(observer)
  first=await connect();second=await connect()
  firstPid=(await first.query('select pg_backend_pid() pid')).rows[0].pid
  secondPid=(await second.query('select pg_backend_pid() pid')).rows[0].pid
  org=id();user=id();foreignOrg=id();foreignUser=id();flower=id()
  evidence={case:ctx.task.name,ids:[]}
  for(const [u,o] of [[user,org],[foreignUser,foreignOrg]]) {
    await observer.query('insert into auth.users(id,email) values($1,$2)',[u,`stock-${u}@example.test`])
    await observer.query('insert into organizations(id,name) values($1,$2)',[o,`local concurrency ${o}`])
    await observer.query('update profiles set organization_id=$1 where id=$2',[o,u])
  }
  await observer.query("insert into flowers(id,organization_id,name) values($1,$2,'Synthetic stock flower')",[flower,org])
})
afterEach(async ctx=>{
  await first?.query('rollback');await second?.query('rollback')
  await first?.end();await second?.end()
  // Exact run-created tenants only; never reset a stack or use broad markers.
  await observer.query('delete from stock_movements where organization_id=any($1::uuid[])',[[org,foreignOrg]])
  await observer.query('delete from orders where organization_id=any($1::uuid[])',[[org,foreignOrg]])
  await observer.query('delete from organizations where id=any($1::uuid[])',[[org,foreignOrg]])
  await observer.query('delete from auth.users where id=any($1::uuid[])',[[user,foreignUser]])
  const leftovers=(await observer.query(`select (select count(*)::int from auth.users where id=any($1::uuid[])) users,(select count(*)::int from organizations where id=any($2::uuid[])) organizations,(select count(*)::int from orders where organization_id=any($2::uuid[])) orders,(select count(*)::int from inventory_items where organization_id=any($2::uuid[])) batches,(select count(*)::int from stock_movements where organization_id=any($2::uuid[])) movements,(select count(*)::int from profiles where id=any($1::uuid[])) profiles,(select count(*)::int from bouquets where id=any($3::uuid[])) bouquets,(select count(*)::int from bouquet_items where bouquet_id=any($3::uuid[])) items`,[[user,foreignUser],[org,foreignOrg],ids])).rows[0]
  evidence.cleanup=leftovers;evidence.ids=ids.splice(0);evidence.result=ctx.task.result?.state
  await observer.end()
  if(process.env.BLOOMWISE_DB_EVIDENCE_DIR) {
    await mkdir(process.env.BLOOMWISE_DB_EVIDENCE_DIR,{recursive:true})
    await writeFile(path.join(process.env.BLOOMWISE_DB_EVIDENCE_DIR,ctx.task.name.replace(/[^a-z0-9-]/gi,'_')+'.json'),JSON.stringify(evidence,null,2))
  }
  expect(Object.values(leftovers)).toEqual([0,0,0,0,0,0,0,0])
})
describe('authenticated stock serialization',()=>{
  it('double-writeoff',async()=>{
    const b=await batch(10),o=await order()
    await actor(first);await write(first,o,[allocation(b)])
    await actor(second);const pending=outcome(write(second,o,[allocation(b)]))
    await blocked();await first.query('commit');const result=await pending;await second.query(result.ok?'commit':'rollback');evidence.response=result
    const s=await state();expect(result).toMatchObject({ok:false,code:'P0001',message:'Склад уже списан по этому заказу'});expect(s.batches[0].quantity_remaining).toBe(7);expect(s.movements).toHaveLength(1)
  })
  it('competing-orders-insufficient',async()=>{
    const b=await batch(5),o1=await order(),o2=await order()
    await actor(first);await write(first,o1,[allocation(b)])
    await actor(second);const pending=outcome(write(second,o2,[allocation(b)]))
    await blocked();await first.query('commit');const result=await pending;await second.query(result.ok?'commit':'rollback');evidence.response=result
    const s=await state();expect(result).toMatchObject({ok:false,code:'P0001',message:expect.stringContaining('Недостаточно остатка')});expect(s.batches[0].quantity_remaining).toBe(2);expect(s.movements).toHaveLength(1);expect(s.orders.find(o=>o.id===o2)?.stock_written_off).toBe(false)
  })
  it('double-return',async()=>{
    const b=await batch(10),o=await order()
    await actor(first);await write(first,o,[allocation(b)]);await first.query('commit')
    await actor(first);await refund(first,o)
    await actor(second);const pending=outcome(refund(second,o))
    await blocked();await first.query('commit');const result=await pending;await second.query(result.ok?'commit':'rollback');evidence.response=result
    const s=await state();expect(result).toMatchObject({ok:false,code:'P0001',message:'Склад уже был возвращён по этому заказу'});expect(s.batches[0].quantity_remaining).toBe(10);expect(s.movements).toHaveLength(2);expect(s.orders[0].stock_returned).toBe(true)
  })
  it('writeoff-versus-cancel',async()=>{
    const b=await batch(10),o=await order()
    await actor(first);await write(first,o,[allocation(b)])
    await actor(second)
    // Same stale read and conditional UPDATE contract as cancelOrder. Dedicated
    // action unit tests ensure its PostgREST filters match this database probe.
    expect((await second.query('select stock_written_off from orders where id=$1',[o])).rows[0].stock_written_off).toBe(false)
    await second.query('commit') // initial PostgREST read completed
    await actor(second) // cancellation UPDATE is its own request/transaction
    const baseline=process.env.BLOOMWISE_CANCEL_BASELINE==='1'
    const pending=outcome((async()=>{
      const updated=await second.query(`update orders set status='cancelled' where id=$1 and organization_id=$2 ${baseline?'':"and stock_written_off=false and status<>'cancelled'"} returning id`,[o,org])
      if(!updated.rowCount) {
        await second.query('commit') // zero-row UPDATE request completed
        await actor(second)
        const current=(await second.query('select stock_written_off,stock_returned from orders where id=$1 and organization_id=$2',[o,org])).rows[0]
        expect(current).toEqual({stock_written_off:true,stock_returned:false})
        await second.query('commit') // fresh SELECT is another request
        await actor(second)
        await refund(second,o) // final return RPC has its own transaction
      }
    })())
    await blocked();await first.query('commit');const result=await pending;await second.query(result.ok?'commit':'rollback');evidence.response=result;evidence.baselineCancellation=baseline;evidence.cancelRequestTransactions=['initial read','guarded update','fresh read','return RPC']
    const s=await state();expect(result.ok).toBe(true);expect(s.orders[0]).toMatchObject({status:'cancelled',stock_written_off:true,stock_returned:true});expect(s.batches[0].quantity_remaining).toBe(10);expect(s.movements).toHaveLength(2)
  })
  it('cancel-before-writeoff',async()=>{
    const b=await batch(10),o=await order()
    await actor(first)
    await first.query("update orders set status='cancelled' where id=$1 and organization_id=$2 and stock_written_off=false and status<>'cancelled' returning id",[o,org])
    await actor(second);const pending=outcome(write(second,o,[allocation(b)]))
    await blocked();await first.query('commit');const result=await pending;await second.query(result.ok?'commit':'rollback');evidence.response=result
    const s=await state();expect(result).toMatchObject({ok:false,code:'P0001',message:'Нельзя списать склад по отменённому заказу'});expect(s.orders[0]).toMatchObject({status:'cancelled',stock_written_off:false,stock_returned:false});expect(s.batches[0].quantity_remaining).toBe(10);expect(s.movements).toHaveLength(0)
  })
  it('writeoff-versus-return',async()=>{
    const b=await batch(10),o=await order()
    await actor(first);await write(first,o,[allocation(b)])
    await actor(second);const pending=outcome(refund(second,o))
    await blocked();await first.query('commit');const result=await pending;await second.query(result.ok?'commit':'rollback');evidence.response=result
    const s=await state();expect(result.ok).toBe(true);expect(s.batches[0].quantity_remaining).toBe(10);expect(s.movements).toHaveLength(2);expect(s.orders[0].stock_returned).toBe(true)
  })
  it('stale-plan-rolls-back-earlier-allocation',async()=>{
    const own=await batch(2),shared=await batch(5),o1=await order(4),o2=await order(4)
    const stalePlan=[allocation(own,1),allocation(shared,3)]
    // Plan was feasible before the other transaction changes its second batch.
    expect((await observer.query('select quantity_remaining from inventory_items where id=$1',[shared])).rows[0].quantity_remaining).toBe(5)
    await actor(first);await write(first,o1,[allocation(shared,4)])
    await actor(second);const pending=outcome(write(second,o2,stalePlan))
    await blocked();await first.query('commit');const result=await pending;await second.query(result.ok?'commit':'rollback');evidence.response=result
    const s=await state();expect(result).toMatchObject({ok:false,code:'P0001',message:expect.stringContaining('Недостаточно остатка')});expect(s.batches.find(b=>b.id===own)?.quantity_remaining).toBe(2);expect(s.batches.find(b=>b.id===shared)?.quantity_remaining).toBe(1);expect(s.movements).toHaveLength(1);expect(s.orders.find(o=>o.id===o2)?.stock_written_off).toBe(false)
  })
  it('tenant-isolation',async()=>{
    const b=await batch(10),o=await order(),foreignFlower=id()
    await observer.query("insert into flowers(id,organization_id,name) values($1,$2,'Other tenant')",[foreignFlower,foreignOrg])
    const otherOrder=await order(3,foreignOrg,foreignFlower)
    for(const target of [o,otherOrder]) {
      await actor(first,foreignUser,foreignOrg)
      const result=await outcome(write(first,target,[allocation(b)]));await first.query('rollback');expect(result.ok).toBe(false)
    }
    await actor(first);await write(first,o,[allocation(b)]);await first.query('commit')
    await actor(second,foreignUser,foreignOrg);expect((await second.query('select id from orders where id=$1',[o])).rowCount).toBe(0)
    expect((await outcome(refund(second,o))).ok).toBe(false);await second.query('rollback')
    const s=await state();expect(s.batches[0].quantity_remaining).toBe(7);expect(s.movements).toHaveLength(1)
  })
})
