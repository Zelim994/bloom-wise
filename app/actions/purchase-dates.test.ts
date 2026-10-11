import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state}))
vi.mock('@/lib/services/organizationService',()=>({getOrgId:async()=> 'own-org'}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
const {updatePurchase}=await import('./purchases')
const item={item_id:'line',inventory_item_id:'tampered-batch',flower_id:'tampered-flower',cost_price:100,effective_cost:999,extra_costs:999,expires_at:'2026-10-13',comment:''}
const input={operation_id:'11111111-1111-4111-8111-111111111111',supplier_name:'',purchase_date:'2026-10-04',comment:'',delivery_cost:10,items:[item]}
beforeEach(()=>{state.rpc.mockReset();state.from.mockReset();state.rpc.mockResolvedValue({data:{purchase_id:'purchase'},error:null})})
for(const expiry of ['2026-10-13',''])it(`passes date and explicit expiry ${expiry||'removal'} to single transaction`,async()=>{
 expect(await updatePurchase('purchase',{...input,items:[{...item,expires_at:expiry}]})).toEqual({id:'purchase'})
 expect(state.rpc).toHaveBeenCalledExactlyOnceWith('save_purchase_atomic',{p_operation_id:input.operation_id,p_purchase_id:'purchase',p_payload:{supplier_name:'',purchase_date:'2026-10-04',comment:'',delivery_cost:10,deleted_item_ids:[],items:[{item_id:'line',cost_price:100,sale_price:null,expires_at:expiry,comment:''}]}})
 expect(state.from).not.toHaveBeenCalled()
})
for(const invalid of [undefined,null,'2026-02-30','not-a-date'])it(`rejects malformed expiry ${String(invalid)} before RPC`,async()=>{
 expect((await updatePurchase('purchase',{...input,items:[{...item,expires_at:invalid as unknown as string}]})).error).toBeTruthy();expect(state.rpc).not.toHaveBeenCalled();expect(state.from).not.toHaveBeenCalled()
})
it('rejects empty purchase date before writes',async()=>{
 expect((await updatePurchase('purchase',{...input,purchase_date:''})).error).toBeTruthy();expect(state.rpc).not.toHaveBeenCalled()
})
it('never exposes database errors or claims partial success',async()=>{
 state.rpc.mockResolvedValue({data:null,error:{code:'23514',message:'private data'}});const r=await updatePurchase('purchase',input);expect(r.error).toContain('отменены');expect(r.error).not.toContain('private');expect(state.from).not.toHaveBeenCalled()
})
