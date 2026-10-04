# Local order stock checkpoint

Prerequisites: Node 24.15.0 (same as CI), `npm ci`, and for browser tests
`npx playwright install chromium` (on a fresh Linux runner, install the required
system libraries with Playwright's documented `--with-deps` option). Vite,
Playwright, Vitest and pg are already pinned/resolved in package-lock.json; no
extra project dependencies are needed. Database tests also require the isolated
local Supabase stack; do not point them at production.

Run from the checkout root with installed dependencies and the canonical local
BloomWise Supabase stack on 127.0.0.1:54421 / database 54422. No production target
or configurable database URL is accepted. Never reset a shared stack to run this
suite. The forward migration `20261004184616_serialize_order_stock.sql` must be
installed locally; a fresh isolated E2E stack includes its identical copy in
`e2e/supabase/migrations`. Existing installations require a reviewed local-only
application of that migration, not historical migrations.

The byte-identical manual release copy is
`supabase/migrations/migration_040_serialize_order_stock.sql`. The root directory
is manual production history, not a runnable CLI migration chain. A future
separately approved release must first compare existing function signatures,
definitions and ACLs, then apply only this file inside one explicit transaction,
verify both order locks and unchanged privileges, and only then publish the app.
Do not replay historical migrations. This checkpoint does not apply it to production.

- `npm run test:browser:orders`: actual OrderForm / OrderStatusActions and shell,
  isolated Playwright Chromium, synthetic action/router boundaries. External
  requests blocked. Does not verify Next.js transport or production.
- `npm run test:browser:orders -- --baseline`: substitutes only the two component
  sources from HEAD in memory, without changing working files. At the pre-fix
  checkpoint both tests must fail for the intended assertions. Once committed,
  HEAD contains the fixes and is no longer a red baseline.
- `npm run test:db:order-stock`: authenticated PostgreSQL concurrency suite.
- `npm run test:db:order-bouquet`: all integration suites including stock.
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`: normal gates.

Optional `BLOOMWISE_DB_EVIDENCE_DIR` / `BLOOMWISE_BROWSER_EVIDENCE_DIR` save
synthetic evidence. No Auth sessions, passwords or tokens are needed for DB tests.
Random exact UUIDs isolate each fixture; cleanup checks users, profiles, orgs,
orders, bouquets/items, batches and movements. Local test administration uses
postgres; each stock function invocation verifies `current_user=authenticated`,
`auth.uid()` and the expected tenant first.

A first authenticated transaction executes a stock operation but holds COMMIT.
A second authenticated transaction starts its competing operation. An independent
observer must see `pg_blocking_pids(second)` contain the first PID and a Lock wait
in `pg_stat_activity`; `pg_locks` is saved before releasing the first transaction.
The polling timeout only bounds this condition, it does not manufacture overlap.
Final stock, flags, movements, per-order quantities and per-batch conservation are
queried independently after both transactions finish. Cancellation is tested in
both serial orders. The action unit suite ties the conditional SQL probe to the
actual PostgREST filters and return RPC path.

Contract: one writeoff and at most one compensating return per order. Stock RPCs
lock the tenant's order before checking flags. Batch compare-and-swap prevents
negative stock and any stale-plan rejection rolls back the entire call. A stale
plan is rejected, not automatically retried. Cancellation updates an unwritten
order conditionally; if writeoff wins it rereads and invokes the atomic return.
This does not redesign roles, validate arbitrary allocations against a concurrently
edited bouquet, or prevent callers from directly modifying stock via other APIs.
Those are separate audit questions, not claims of this checkpoint.
