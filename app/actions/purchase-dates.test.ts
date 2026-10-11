import { beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({client:null as unknown,supplier:vi.fn(async()=>({supplierId:null}))}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}))
vi.mock('@/lib/services/organizationService',()=>({getOrgId:async()=> 'own-org'}))
vi.mock('@/lib/services/purchaseService',()=>({findOrCreateSupplier:state.supplier,validateAndDeleteInventoryBatch:vi.fn()}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
const {updatePurchase}=await import('./purchases')
const item={item_id:'line',inventory_item_id:'tampered-batch',flower_id:'flower',cost_price:100,effective_cost:100,extra_costs:0,expires_at:'2026-10-13',comment:''}
const input={supplier_name:'',purchase_date:'2026-10-04',comment:'',delivery_cost:0,items:[item]}
type Call={table:string;method:string;args:unknown[]}
let calls:Call[]
function client(fault?:'line'|'batch'|'missing-batch'|'wrong-purchase'){
 state.client={from:(table:string)=>{
  let writing=false
  const response=()=>({data:table==='purchase_items'&&!writing?[{id:'line',purchase_id:fault==='wrong-purchase'?'other':'purchase',quantity:5,inventory_item_id:'canonical-batch'}]:fault==='missing-batch'?null:{id:'canonical-batch'},error:(table==='purchase_items'&&writing&&fault==='line')||(table==='inventory_items'&&fault==='batch')?{message:'private internal error'}:null})
  const b={select:(...args:unknown[])=>{calls.push({table,method:'select',args});return b},eq:(...args:unknown[])=>{calls.push({table,method:'eq',args});return b},in:()=>b,
   update:(...args:unknown[])=>{writing=true;calls.push({table,method:'update',args});return b},
   maybeSingle:async()=>response(),then:(resolve:(r:unknown)=>unknown)=>resolve(response())
  };return b
 }}
}
beforeEach(()=>{calls=[];state.supplier.mockClear()})
for(const expiry of ['2026-10-13',''])it(`propagates date and expiry ${expiry||'removal'} to canonical tenant batch`,async()=>{
 client();expect(await updatePurchase('purchase',{...input,items:[{...item,expires_at:expiry}]})).toEqual({})
 expect(calls).toContainEqual({table:'inventory_items',method:'update',args:[{cost_price:100,arrived_at:'2026-10-04',expires_at:expiry||null}]})
 expect(calls).toContainEqual({table:'inventory_items',method:'eq',args:['id','canonical-batch']})
 expect(calls).toContainEqual({table:'inventory_items',method:'eq',args:['organization_id','own-org']})
 expect(calls.some(c=>c.args.includes('tampered-batch'))).toBe(false)
})
for(const fault of ['line','batch','missing-batch','wrong-purchase'] as const)it(`does not claim success on ${fault}`,async()=>{
 client(fault);const r=await updatePurchase('purchase',input);expect(r.error).toBeTruthy();expect(r.error).not.toContain('private')
 if(fault==='line') expect(calls.some(c=>c.table==='inventory_items')).toBe(false)
 if(fault==='wrong-purchase') expect(calls.some(c=>c.method==='update')).toBe(false)
})
for(const invalid of [undefined,null,'2026-02-30','not-a-date'])it(`rejects malformed expiry ${String(invalid)} before writes`,async()=>{
 client();const r=await updatePurchase('purchase',{...input,items:[{...item,expires_at:invalid as unknown as string}]})
 expect(r.error).toBeTruthy();expect(calls.some(c=>c.method==='update')).toBe(false);expect(state.supplier).not.toHaveBeenCalled()
})
it('rejects empty purchase date before writes',async()=>{
 client();expect((await updatePurchase('purchase',{...input,purchase_date:''})).error).toBeTruthy();expect(calls.some(c=>c.method==='update')).toBe(false);expect(state.supplier).not.toHaveBeenCalled()
})
