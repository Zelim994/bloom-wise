import { beforeEach, describe, expect, it, vi } from 'vitest'
const current=vi.hoisted(()=>({client:null as unknown,revalidate:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>current.client}))
vi.mock('@/lib/services/organizationService',()=>({getOrgId:async()=> 'tenant'}))
vi.mock('next/cache',()=>({revalidatePath:current.revalidate}))
const {cancelOrder}=await import('./orders')
type Row={status?:string;stock_written_off:boolean;stock_returned:boolean}
function mock(options:{initial?:Row;updated?:string[];latest?:Row|null;readError?:string;updateError?:string;rpcError?:string}={}) {
 const calls:{method:string;args:unknown[]}[]=[]
 let reads=0
 const rpc=vi.fn(async()=>({error:options.rpcError?{message:options.rpcError}:null}))
 current.client={rpc,from:(table:string)=>{
  expect(table).toBe('orders')
  let writing=false
  const b={
   select:(...args:unknown[])=>{calls.push({method:'select',args});return b},
   eq:(...args:unknown[])=>{calls.push({method:'eq',args});return b},
   neq:(...args:unknown[])=>{calls.push({method:'neq',args});return b},
   update:(...args:unknown[])=>{writing=true;calls.push({method:'update',args});return b},
   single:async()=>{reads++;return {data:reads===1?(options.initial??{status:'ready',stock_written_off:false,stock_returned:false}):(options.latest===undefined?{stock_written_off:true,stock_returned:false}:options.latest),error:reads>1&&options.readError?{message:options.readError}:null}},
   then:(resolve:(r:unknown)=>unknown)=>resolve({data:writing?(options.updated??[]).map(id=>({id})):null,error:options.updateError?{message:options.updateError}:null}),
  };return b
 }}
 return {calls,rpc}
}
beforeEach(()=>current.revalidate.mockReset())
describe('cancelOrder conditional cancellation',()=>{
 it('returns stock after a concurrent writeoff wins the guarded update',async()=>{
  const m=mock();expect(await cancelOrder('order')).toEqual({ok:true})
  expect(m.calls).toEqual(expect.arrayContaining([
   {method:'eq',args:['id','order']},{method:'eq',args:['organization_id','tenant']},
   {method:'eq',args:['stock_written_off',false]},{method:'neq',args:['status','cancelled']},
   {method:'select',args:['id']},
  ]))
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith('return_order_stock',{p_order_id:'order'})
  expect(current.revalidate).toHaveBeenCalledTimes(2)
 })
 it('cancels an unwritten order without a compensating movement',async()=>{
  const m=mock({updated:['order']});expect(await cancelOrder('order')).toEqual({ok:true});expect(m.rpc).not.toHaveBeenCalled()
 })
 it('does not retry a completed cancellation',async()=>{
  const m=mock({latest:{stock_written_off:true,stock_returned:true}})
  expect(await cancelOrder('order')).toEqual({ok:false,error:'Заказ уже отменён'});expect(m.rpc).not.toHaveBeenCalled();expect(current.revalidate).not.toHaveBeenCalled()
 })
 for(const fault of ['updateError','readError','rpcError'] as const) it(`propagates ${fault} without reporting success`,async()=>{
  mock({[fault]:'Synthetic failure'});expect(await cancelOrder('order')).toEqual({ok:false,error:'Synthetic failure'});expect(current.revalidate).not.toHaveBeenCalled()
 })
 it('preserves cancellation of already written orders',async()=>{
  const m=mock({initial:{status:'ready',stock_written_off:true,stock_returned:false}})
  expect(await cancelOrder('order')).toEqual({ok:true});expect(m.calls.some(c=>c.method==='update')).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(1)
 })
})
