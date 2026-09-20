// Real RecipeForm + BuilderLayout; server action/router are mocked.
// Uses an isolated browser profile and rejects every external request.
import { build } from 'vite'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const temp = await mkdtemp(path.join(tmpdir(), 'bw-recipe-browser-'))
const evidenceDir = process.env.BLOOMWISE_BROWSER_EVIDENCE_DIR
let server, browser
const results = []
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {RecipeForm} from ${JSON.stringify(path.join(root, 'components/recipes/RecipeForm'))};
const flower = {
  id:'f:none:none', flower_id:'f', name:'Тестовая роза', unit:'шт', category:'flower',
  variety_id:null, variety_name:null, variety_size:null, color_id:null, color_name:null,
  current_stock:100, unit_cost:10, sale_price:30
};
window.calls=[]; window.navigation=[]; window.scenario='error';
createRoot(document.getElementById('root')).render(
  <RecipeForm recipeId='r' flowers={[flower]} initialRecipe={{
    id:'r', name:'Исходный рецепт', style:'нежный', assembly_notes:'Сборка',
    comment:'Комментарий', recommended_price:100,
    items:[{flower_id:'f', name:'Тестовая роза', unit:'шт', quantity:2, unit_cost:10}]
  }}/>
);`

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
      lib: { entry: path.join(temp, 'entry.tsx'), name: 'RecipeHarness', formats: ['iife'], fileName: () => 'app.js' },
    },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{
      name: 'test-boundaries', enforce: 'pre',
      resolveId(id) {
        if (['next/navigation', '@/app/actions/recipes', '@/app/actions/ai', root + '/app/actions/recipes', root + '/app/actions/ai'].includes(id)) {
          return '\0mock:' + id
        }
      },
      load(id) {
        if (!id.startsWith('\0mock:')) return null
        if (id.endsWith('/ai')) return `export function generateBouquetImage(){throw Error('AI disabled')} export function saveAIBouquetGeneration(){throw Error('AI disabled')}`
        if (id.endsWith('next/navigation')) return `export function useRouter(){return {push:p=>window.navigation.push(p),refresh:()=>{},back:()=>{}}}`
        return `export async function upsertRecipe(p){
          window.calls.push(p);
          await new Promise(resolve=>window.releaseSave=resolve);
          if(window.scenario==='throw')throw Error('Synthetic lost reply');
          if(window.scenario==='empty')return {};
          if(window.scenario==='null')return null;
          if(window.scenario==='success')return {id:'saved-id'};
          return {error:'Тестовая ошибка сохранения'};
        }`
      },
    }],
  })
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
  for (const scenario of ['error', 'throw', 'empty', 'null', 'success']) {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(origin)
    await page.getByPlaceholder('Нежный рассвет').fill('Не потерять ввод')
    await page.getByPlaceholder('Для особых случаев...').fill('Сохранить комментарий')
    await page.evaluate(s => { window.scenario = s }, scenario)
    const button = page.locator('button[type=submit]')
    await button.click()
    await page.waitForFunction(() => window.calls.length === 1)
    assert(await button.isDisabled())
    // A second submit while the mocked action is still pending must be ignored.
    await page.evaluate(() => document.querySelector('form').requestSubmit())
    assert.equal(await page.evaluate(() => window.calls.length), 1)
    await page.evaluate(() => window.releaseSave())
    await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled)
    const state = await page.evaluate(() => ({ calls: window.calls, navigation: window.navigation }))
    assert.equal(state.calls.length, 1)
    assert.equal(state.calls[0].name, 'Не потерять ввод')
    assert.equal(state.calls[0].items.length, 1)
    assert.equal(state.calls[0].items[0].quantity, 2)
    if (scenario === 'success') {
      assert.deepEqual(state.navigation, ['/recipes/saved-id'])
    } else {
      assert.deepEqual(state.navigation, [])
      assert.equal(await page.getByPlaceholder('Нежный рассвет').inputValue(), 'Не потерять ввод')
      assert.equal(await page.getByPlaceholder('Для особых случаев...').inputValue(), 'Сохранить комментарий')
      assert.equal(await page.getByRole('alert').count(), 1)
      if (scenario !== 'error') assert.match(await page.getByRole('alert').innerText(), /неизвестно/)
      // Only a synthetic action is resubmitted: proves composition remains in state.
      await button.click()
      await page.waitForFunction(() => window.calls.length === 2)
      assert.deepEqual(await page.evaluate(() => window.calls[1].items), state.calls[0].items)
      await page.evaluate(() => window.releaseSave())
      await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled)
      assert.equal(await page.getByRole('alert').count(), 1)
    }
    assert.deepEqual(errors, [])
    results.push({ scenario, pendingSubmitIgnored: true, pass: true })
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true })
      await page.screenshot({ path: path.join(evidenceDir, scenario + '.png'), fullPage: true })
    }
    await context.close()
  }
  console.log(JSON.stringify({ scope: 'Actual RecipeForm/BuilderLayout; mocked action/router; not production or Next.js transport', results }, null, 2))
  if (evidenceDir) await writeFile(path.join(evidenceDir, 'results.json'), JSON.stringify(results, null, 2))
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
