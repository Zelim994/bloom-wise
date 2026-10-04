// Real OrderDetailShell + OrderStatusActions + OrderForm (as on /orders/[id]);
// server actions/router/AI are mocked. Uses an isolated browser profile and
// rejects every external request.
//
// --baseline: OrderForm.tsx and OrderStatusActions.tsx are loaded from
// `git show HEAD:<path>` inside the Vite load hook (originals are never
// touched), so the same cases can demonstrate the pre-fix failures.
import { build } from 'vite'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const baseline = process.argv.slice(2).includes('--baseline')
const temp = await mkdtemp(path.join(tmpdir(), 'bw-order-browser-'))
const evidenceDir = process.env.BLOOMWISE_BROWSER_EVIDENCE_DIR
let server, browser
const results = []

// Only these two files may be substituted, and only with fixed git arguments.
const BASELINE_FILES = {
  [path.join(root, 'components/orders/OrderForm.tsx')]: 'HEAD:components/orders/OrderForm.tsx',
  [path.join(root, 'components/orders/OrderStatusActions.tsx')]: 'HEAD:components/orders/OrderStatusActions.tsx',
}
const substituted = new Set()
const headCommit = baseline
  ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  : null

const DELIVERY_ERROR = 'Нельзя выдать заказ: сначала спишите склад.'
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {OrderDetailShell} from ${JSON.stringify(path.join(root, 'components/orders/OrderDetailShell'))};
import {OrderStatusActions} from ${JSON.stringify(path.join(root, 'components/orders/OrderStatusActions'))};
import {OrderForm} from ${JSON.stringify(path.join(root, 'components/orders/OrderForm'))};
const flower = {
  id:'f:v1:c1', flower_id:'f', name:'Тестовая роза', unit:'шт', category:'flower',
  variety_id:'v1', variety_name:'Мондиаль', variety_size:'60', color_id:'c1', color_name:'Белый',
  current_stock:100, unit_cost:20, sale_price:60
};
const order = {
  id:'o1', order_number:'BW-0001', status:'ready', payment_status:'unpaid',
  stock_written_off:false, stock_returned:false,
  customers:{id:'cu1', full_name:'Анна Тестовая', phone:'+7 900 000-00-00'},
  type:'pickup', order_date:'2026-10-04', ready_at:'2026-10-05T12:00:00',
  delivery_address:null, subtotal:300, delivery_cost:0, discount:0, total_amount:300,
  payment_method:'cash', paid_amount:0, customer_comment:'', florist_comment:'Старый комментарий',
  bouquet:{sale_price:300, cost_price:100, profit:200, margin_percent:66.67,
    items:[{flower_id:'f', variety_id:'v1', color_id:'c1', quantity:5, unit_cost:20}]}
};
window.calls={updateOrder:[], updateOrderStatus:[], unexpected:[]}; window.navigation=[];
createRoot(document.getElementById('root')).render(
  <OrderDetailShell>
    <OrderStatusActions orderId={order.id} status={order.status} totalAmount={order.total_amount}
      paidAmount={order.paid_amount} paymentMethod={order.payment_method}/>
    <OrderForm flowers={[flower]} initialData={order}/>
  </OrderDetailShell>
);`

const ordersMock = `
const unexpected = name => async (...args) => { window.calls.unexpected.push({name, args}); throw Error(name + ' disabled in harness') };
export async function updateOrder(id, payload){ window.calls.updateOrder.push({id, payload}); return {} }
export async function updateOrderStatus(id, status){
  window.calls.updateOrderStatus.push({id, status});
  return {error:${JSON.stringify(DELIVERY_ERROR)}};
}
export async function searchCustomers(){ return [] }
export const getOrders = unexpected('getOrders');
export const getOrder = unexpected('getOrder');
export const getCustomers = unexpected('getCustomers');
export const findCustomerByPhone = unexpected('findCustomerByPhone');
export const createOrder = unexpected('createOrder');
export const sendWhatsAppMessage = unexpected('sendWhatsAppMessage');
export const updateOrderPayment = unexpected('updateOrderPayment');
export const writeOffOrderStock = unexpected('writeOffOrderStock');
export const cancelOrder = unexpected('cancelOrder');`

const MOCKED = ['next/navigation', 'app/actions/orders', 'app/actions/recipes', 'app/actions/ai']
function mockKey(id) {
  if (id === 'next/navigation') return id
  for (const m of MOCKED.slice(1)) if (id === '@/' + m || id === path.join(root, m)) return m
  return null
}

async function runCase(name, origin, fn) {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const result = { case: name }
  try {
    await page.goto(origin)
    Object.assign(result, await fn(page))
    assert.deepEqual(errors, [])
    result.pass = true
  } catch (e) {
    result.pass = false
    result.error = e.message
  }
  result.pageErrors = errors
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true })
    await page.screenshot({ path: path.join(evidenceDir, (baseline ? 'baseline-' : '') + name + '.png'), fullPage: true }).catch(() => {})
  }
  await context.close()
  results.push(result)
}

try {
  await writeFile(path.join(temp, 'entry.tsx'), entry)
  await build({
    root, configFile: false, logLevel: 'error',
    resolve: { alias: {
      '@': root,
      'react': path.join(root, 'node_modules/react'),
      'react-dom': path.join(root, 'node_modules/react-dom'),
    } },
    build: {
      outDir: path.join(temp, 'dist'), emptyOutDir: true,
      lib: { entry: path.join(temp, 'entry.tsx'), name: 'OrderHarness', formats: ['iife'], fileName: () => 'app.js' },
    },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{
      name: 'test-boundaries', enforce: 'pre',
      resolveId(id) {
        const key = mockKey(id)
        if (key) return '\0mock:' + key
      },
      load(id) {
        if (id.startsWith('\0mock:')) {
          const key = id.slice('\0mock:'.length)
          if (key === 'next/navigation') return `export function useRouter(){return {push:p=>window.navigation.push('push:'+p),refresh:()=>window.navigation.push('refresh'),back:()=>window.navigation.push('back')}}`
          if (key === 'app/actions/orders') return ordersMock
          if (key === 'app/actions/ai') return `export function generateBouquetImage(){throw Error('AI disabled')} export function saveAIBouquetGeneration(){throw Error('AI disabled')}`
          return `export {}`
        }
        const file = id.split('?')[0]
        if (baseline && BASELINE_FILES[file]) {
          substituted.add(BASELINE_FILES[file])
          return execFileSync('git', ['show', BASELINE_FILES[file]], { cwd: root, encoding: 'utf8' })
        }
        return null
      },
    }],
  })
  if (baseline) assert.equal(substituted.size, 2, 'baseline substitution did not cover both component files')

  server = createServer(async (req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : 'text/html')
    res.end(req.url === '/app.js'
      ? await readFile(path.join(temp, 'dist/app.js'))
      : '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  })

  // Comment-only edit: the builder is never touched, so OrderForm falls back to
  // initialData.bouquet — the variant identity must survive into the payload.
  await runCase('comment-only-edit-keeps-variant', origin, async page => {
    await page.getByPlaceholder('Особенности сборки, упаковки...').fill('Новый комментарий')
    await page.getByRole('button', { name: 'Сохранить изменения' }).last().click()
    await page.waitForFunction(() => window.calls.updateOrder.length === 1, null, { timeout: 5000 })
    const { updateOrder, unexpected } = await page.evaluate(() => window.calls)
    const items = updateOrder[0].payload.bouquet?.items ?? []
    const evidence = {
      floristComment: updateOrder[0].payload.florist_comment,
      items: items.map(i => ({ flower_id: i.flower_id, variety_id: i.variety_id ?? '<missing>', color_id: i.color_id ?? '<missing>', quantity: i.quantity })),
    }
    try {
      assert.deepEqual(unexpected, [])
      assert.equal(updateOrder[0].id, 'o1')
      assert.equal(evidence.floristComment, 'Новый комментарий')
      assert.equal(items.length, 1)
      assert.equal(items[0].flower_id, 'f')
      assert.equal(items[0].variety_id, 'v1', 'variety_id lost in updateOrder payload')
      assert.equal(items[0].color_id, 'c1', 'color_id lost in updateOrder payload')
      assert.equal(items[0].quantity, 5)
    } catch (e) {
      e.message = e.message + ' | evidence ' + JSON.stringify(evidence)
      throw e
    }
    return { evidence }
  })

  // Delivery before write-off: the action returns an error; it must be shown as
  // role=alert and the page must not be refreshed as if the status changed.
  await runCase('delivery-error-shown-no-refresh', origin, async page => {
    const button = page.getByRole('button', { name: 'Выдан клиенту' })
    await button.click()
    await page.waitForFunction(() => window.calls.updateOrderStatus.length === 1, null, { timeout: 5000 })
    // Pending label is "..."; wait until the transition settles in either version.
    await page.getByRole('button', { name: 'Выдан клиенту' }).waitFor({ timeout: 5000 })
    const state = await page.evaluate(() => ({ calls: window.calls, navigation: window.navigation }))
    const alerts = await page.getByRole('alert').allInnerTexts()
    const evidence = { statusCalls: state.calls.updateOrderStatus, navigation: state.navigation, alerts }
    try {
      assert.deepEqual(state.calls.unexpected, [])
      assert.deepEqual(state.calls.updateOrderStatus, [{ id: 'o1', status: 'delivered' }])
      assert.deepEqual(alerts.filter(t => t.includes(DELIVERY_ERROR)).length, 1, 'server error not rendered as role=alert')
      assert.deepEqual(state.navigation, [], 'router navigated/refreshed after failed status update')
    } catch (e) {
      e.message = e.message + ' | evidence ' + JSON.stringify(evidence)
      throw e
    }
    return { evidence }
  })

  const report = {
    scope: 'Actual OrderDetailShell/OrderStatusActions/OrderForm/BuilderLayout; mocked actions/router/AI; not production or Next.js transport',
    mode: baseline ? `baseline (components from ${headCommit})` : 'working tree',
    ...(baseline ? { substituted: [...substituted] } : {}),
    results,
  }
  console.log(JSON.stringify(report, null, 2))
  if (evidenceDir) await writeFile(path.join(evidenceDir, (baseline ? 'baseline-' : '') + 'results.json'), JSON.stringify(report, null, 2))
  if (results.some(r => !r.pass)) process.exitCode = 1
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
