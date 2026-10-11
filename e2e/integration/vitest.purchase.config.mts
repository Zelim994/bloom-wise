import {defineConfig} from 'vitest/config'
import {fileURLToPath} from 'node:url'
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('../../',import.meta.url))}},test:{include:['e2e/integration/purchase-save.dbtest.ts'],fileParallelism:false,sequence:{concurrent:false},testTimeout:30000,hookTimeout:60000}})
