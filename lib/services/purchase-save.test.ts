import {readFileSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {savePurchaseViaRpc} from './purchaseService'
type Client=Parameters<typeof savePurchaseViaRpc>[0]
it('recovers committed result after lost RPC reply without repeating save',async()=>{
 const rpc=vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce({data:{status:'committed',purchase_id:'purchase'},error:null})
 expect(await savePurchaseViaRpc({rpc} as unknown as Client,'op',null,{})).toEqual({id:'purchase'})
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['save_purchase_atomic','purchase_save_status'])
})
for(const status of ['absent','in_progress','unknown'])it(`keeps uncertain ${status} result, without auto create`,async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({error:{message:'Failed to fetch',code:''},data:null}).mockResolvedValueOnce({data:{status},error:null})
 expect((await savePurchaseViaRpc({rpc} as unknown as Client,'op',null,{})).uncertain).toBe(true);expect(rpc).toHaveBeenCalledTimes(2)
})
it('known rollback does not reconcile into unrelated prior success',async()=>{
 const rpc=vi.fn().mockResolvedValue({error:{code:'P0001',message:'BW_OPERATION_CONFLICT'},data:null})
 expect((await savePurchaseViaRpc({rpc} as unknown as Client,'op',null,{})).error).toContain('другими данными');expect(rpc).toHaveBeenCalledTimes(1)
})

it('local and operational SQL041 copies stay byte-identical',()=>{
 expect(readFileSync('e2e/supabase/migrations/20261007111425_atomic_purchase_save.sql','utf8')).toBe(readFileSync('supabase/migrations/migration_041_atomic_purchase_save.sql','utf8'))
})
