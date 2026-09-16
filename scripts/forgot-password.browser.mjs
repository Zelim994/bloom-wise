// Run against a local BloomWise server only. All Auth requests are mocked;
// every other external request and every local mutation is blocked.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const origin = new URL(process.env.BLOOMWISE_BROWSER_URL || 'http://localhost:3000')
assert(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))
assert(origin.pathname === '/' && !origin.search && !origin.hash && !origin.username && !origin.password)
const evidenceDir = process.env.BLOOMWISE_BROWSER_EVIDENCE_DIR
if (evidenceDir) await mkdir(evidenceDir, { recursive: true })

await test('forgot-password: hydration and intercepted Auth responses', async (suite) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  })
  try {
    for (const scenario of ['success', 'error', 'network-error', 'scripts-blocked']) {
      await suite.test(scenario, async () => {
        const context = await browser.newContext({ serviceWorkers: 'block' })
        const evidence = { scenario, recover: [], blockedExternal: 0, documents: 0, pageErrors: 0, badScripts: [] }
        try {
          await context.route('**/*', async (route) => {
            const request = route.request()
            const url = new URL(request.url())
            if (url.pathname === '/auth/v1/recover') {
              if (request.method() === 'OPTIONS') {
                return route.fulfill({ status: 204, headers: {
                  'access-control-allow-origin': '*',
                  'access-control-allow-methods': 'POST, OPTIONS',
                  'access-control-allow-headers': '*',
                } })
              }
              assert.equal(request.method(), 'POST')
              assert.equal(url.searchParams.get('redirect_to'), `${origin.origin}/auth/callback?next=/reset-password`)
              // Never save headers, keys, tokens or the email request body.
              evidence.recover.push({ endpoint: url.origin + url.pathname })
              if (scenario === 'network-error') return route.abort('failed')
              return route.fulfill({
                status: scenario === 'error' ? 500 : 200,
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: scenario === 'error' ? JSON.stringify({ code: 'unexpected_failure', msg: 'Synthetic failure' }) : '{}',
              })
            }
            if (url.origin !== origin.origin) {
              evidence.blockedExternal++
              return route.abort()
            }
            if (!['GET', 'HEAD'].includes(request.method())) return route.abort()
            if (scenario === 'scripts-blocked' && request.resourceType() === 'script') return route.abort()
            return route.continue()
          })
          const page = await context.newPage()
          page.setDefaultTimeout(30000)
          page.on('pageerror', () => evidence.pageErrors++)
          // Next also emits same-document history updates during hydration.
          // Count real document requests, not those client-side transitions.
          page.on('request', request => {
            if (request.resourceType() === 'document' && request.frame() === page.mainFrame()) evidence.documents++
          })
          page.on('response', response => {
            if (response.request().resourceType() === 'script' && response.status() >= 400) {
              evidence.badScripts.push({ path: new URL(response.url()).pathname, status: response.status() })
            }
          })
          await page.goto(new URL('/forgot-password', origin).href, { waitUntil: 'networkidle' })
          const input = page.getByLabel('Email', { exact: true })
          const button = page.getByRole('button', { name: 'Отправить ссылку', exact: true })
          if (scenario === 'scripts-blocked') {
            assert(await page.getByRole('status').getByText(/Загружаем форму/).isVisible())
            if (await input.count()) {
              assert(await input.isDisabled())
              assert(await button.isDisabled())
            } else {
              // A statically rendered Suspense boundary shows its fallback
              // until useSearchParams can run in the browser.
              assert.equal(await button.count(), 0)
            }
            // Verify the controls remain unavailable without hydration.
            // Do not force a native submission by overriding their disabled state.
            assert.equal(evidence.recover.length, 0)
          } else {
            await input.fill('diagnostic@example.test') // waits for hydration to enable input
            await button.click()
            if (scenario === 'success') {
              await page.getByText('Если такой email зарегистрирован, мы отправили ссылку для восстановления пароля.', { exact: true }).waitFor()
              assert.equal(await page.locator('#email').count(), 0)
            } else {
              await page.getByRole('alert').getByText('Не удалось отправить ссылку. Попробуйте позже.', { exact: true }).waitFor()
              assert.equal(await input.inputValue(), 'diagnostic@example.test')
              assert(await button.isEnabled())
            }
            assert.equal(evidence.recover.length, 1)
            assert.equal(evidence.badScripts.length, 0)
            assert.equal(evidence.pageErrors, 0)
          }
          assert.equal(evidence.documents, 1, 'form must not perform a native page reload')
          assert.equal(evidence.blockedExternal, 0, 'unexpected external traffic was blocked')
          if (evidenceDir) {
            await mkdir(evidenceDir, { recursive: true })
            await page.screenshot({ path: path.join(evidenceDir, `${scenario}-fixed.png`) })
          }
        } finally {
          if (evidenceDir) await writeFile(path.join(evidenceDir, `${scenario}-evidence.json`), JSON.stringify(evidence, null, 2))
          await context.close()
        }
      })
    }
  } finally {
    await browser.close()
  }
})
