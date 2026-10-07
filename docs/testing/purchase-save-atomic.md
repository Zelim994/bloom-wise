# Atomic purchase save (SQL041)

Use Node 24, Docker, Supabase CLI and the existing `bloomwise-e2e` local stack on API54421/DB54422. Never reset another task's running stack. `npm ci` uses the existing locked `pg`, Vitest and Playwright dependencies; no new dependency is needed.

On a fresh isolated stack, `npm run e2e:db:start` and its canonical migrations include `e2e/supabase/migrations/20261007111425_atomic_purchase_save.sql`. On an existing stack, inspect migration history before applying pending local migrations with `supabase --workdir e2e migration up --local`; stop on unrelated pending migrations or an already-created `purchase_private` schema. Do not rerun the create-table migration. The timestamp file is byte-identical to `supabase/migrations/migration_041_atomic_purchase_save.sql`; historical migrations are unchanged.

```sh
npm run e2e:db:check
BLOOMWISE_PURCHASE_EVIDENCE_DIR=/absolute/path/db-evidence npm run test:db:purchase-save
BLOOMWISE_BROWSER_EVIDENCE_DIR=/absolute/path/browser-evidence npm run test:browser:purchase-customer
npm test
npm run lint
npm run typecheck
npm run build
```

The DB suite invokes the real purchase Server Action functions (only Next cache and server-client construction mocked), using authenticated Supabase clients over real local HTTP/PostgREST, followed by independent SQL assertions. Fixture administration uses local PostgreSQL and local Auth admin; business saves never use service_role. Passwords and local keys stay in memory. Guarded random tenants are removed in `afterEach` and absence asserted. Evidence paths are optional for DB tests and required for browser tests; keep artifacts outside git.

Baseline failures: editing committed the new supplier/header/line before a controlled batch UPDATE error; repeating a create operation produced another purchase. Original creation already rolled back on movement failure. Regression assertions compare full rows, including timestamps, before/after failure. Faults cover supplier, header, batch, movement, purchase line and flower price. Deletion compensation preserves the zero batch/history and rolls back together with the save when a later write fails.

Successful edit derives quantities, batch/flower IDs and delivery distribution from locked stored rows. Tests reject foreign/omitted lines, consumed batch deletion, altered replay payload and missing auth; existing own-organization florist permissions remain. Legacy null-flower lines fail clearly without writes. Two identical HTTP requests are deliberately blocked behind an advisory lock; `pg_blocking_pids` and `wait_event=advisory` must show both requests waiting before release. One receipt/purchase results. An additional test drops the HTTP response after consuming its body and verifies one save call plus status reconciliation.

The isolated real Chrome suite submits actual login/order/purchase forms through Next Server Actions, protects PR7 customer/date regressions, drops a purchase Server Action response after completion, verifies Save is locked, reloads and reconciles the original purchase without a duplicate. Only the operation UUID is retained in sessionStorage, not purchase data or credentials. Unknown/in-progress results require status checking; no automatic new operation is created. No user Chrome profile or production endpoint is used.

The public save/status functions are SECURITY INVOKER with fixed empty search_path; existing business RLS applies. Private SECURITY DEFINER receipt functions derive the actor and organization themselves; the receipt table has RLS and no authenticated/anon table grants. Deleting a purchase does not delete its receipt, preventing an old create retry from resurrecting it. Removing an Auth user/organization does cascade their receipts. Concurrent legacy create clients do not acquire the new supplier/request locks. Full purchase deletion and the standalone delete-line action retain their previous implementation and are outside this save boundary.

SQL041 is additive. Deploy requires SQL041 first; rollback of the application must retain SQL041 and receipts. Local tests are not production evidence. CI runs unit/lint/typecheck/build, not these local DB/browser scenarios.

For this additive migration, the narrow local CLI exception is documented in `CLAUDE.md`; the general wrapper restriction remains in effect. Resolve all CLI workdirs from the repository, not a user-supplied target. Every future function in `purchase_private` must explicitly revoke default PUBLIC/anon EXECUTE grants. Verify that this private schema is not exposed by the API as a release preflight; an unset database `pgrst.db_schemas` setting is not proof of platform configuration.
