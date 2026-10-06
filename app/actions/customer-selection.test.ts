import { beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({client:null as unknown}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}))
vi.mock('@/lib/services/organizationService',()=>({getOrgId:async()=> 'own-org'}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
const {createOrder}=await import('./orders')
const selected='11111111-1111-4111-8111-111111111111'
const input={customer_id:selected,customer_name:'No phone',customer_phone:'',type:'pickup',order_date:'2026-10-06',ready_at:'12:00',subtotal:500}
type Call={table:string;method:string;args:unknown[]}
let calls:Call[]
function client(lookup: {id:string}|null={id:selected},error:unknown=null){
 state.client={from:(table:string)=>{
  let insert=false
  const b={select:(...args:unknown[])=>{calls.push({table,method:'select',args});return b},eq:(...args:unknown[])=>{calls.push({table,method:'eq',args});return b},
   insert:(...args:unknown[])=>{insert=true;calls.push({table,method:'insert',args});return b},
   maybeSingle:async()=>({data:lookup,error}),
   single:async()=>({data:insert?{id:table==='orders'?'new-order':'duplicate'}:lookup,error:null})
  };return b
 }}
}
beforeEach(()=>{calls=[]})
it('reuses the explicitly selected phone-less customer rather than inserting a duplicate',async()=>{
 client();expect(await createOrder(input)).toEqual({id:'new-order'})
 expect(calls).toContainEqual({table:'customers',method:'eq',args:['id',selected]})
 expect(calls).toContainEqual({table:'customers',method:'eq',args:['organization_id','own-org']})
 expect(calls.filter(c=>c.table==='customers'&&c.method==='insert')).toHaveLength(0)
 expect(calls.find(c=>c.table==='orders'&&c.method==='insert')?.args[0]).toMatchObject({customer_id:selected})
})
for(const reason of ['foreign-or-missing','query-error','invalid-id'] as const)it(`stops ${reason} before writes`,async()=>{
 client(null,reason==='query-error'?{message:'private database detail'}:null)
 const result=await createOrder({...input,customer_id:reason==='invalid-id'?'invalid':selected})
 expect(result.error).toBeTruthy();expect(result.error).not.toContain('private');expect(calls.some(c=>c.method==='insert')).toBe(false)
})
it('keeps manual same-name creation distinct when no customer was selected',async()=>{
 client();expect(await createOrder({...input,customer_id:undefined})).toEqual({id:'new-order'})
 expect(calls.filter(c=>c.table==='customers'&&c.method==='insert')).toHaveLength(1)
})
