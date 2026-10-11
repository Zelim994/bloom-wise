# Purchase date / contactless customer regressions

`npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` run ordinary checks. Python 3 is needed only for `npm run test:coordination`. No new npm dependency is introduced.

For the real form regression use Node >=22.18, Docker, Supabase CLI and the existing isolated `bloomwise-e2e` stack (`npm run e2e:db:check`). Do not reset an existing stack. Local database identity, expected API/DB ports 54421/54422 and canonical migration gates must pass. Chrome defaults to the installed macOS binary; another locally installed Chromium can be supplied using `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

```sh
BLOOMWISE_BROWSER_EVIDENCE_DIR=/absolute/path/out npm run test:browser:purchase-customer
```

The harness starts its own Next dev server and isolated headless Chrome, logs in through the real login form with a generated local-only Auth user, and submits real order/purchase forms through Server Actions. Local fixture setup and independent assertions use PostgreSQL; local Auth provisioning uses the local admin endpoint. Credentials/keys stay in memory and subprocess environment, never evidence or command arguments. No real emails. Browser traffic is restricted to loopback app/API; no user browser profile is used.

It checks selected/prefilled and dropdown contactless customer reuse, invalidated selection after editing, authenticated cross-organization customer invisibility, purchase date/expiry propagation and expiry removal, unchanged stock quantities/movement counts. Unit tests additionally verify invalid/missing/foreign customer rejection and database-error handling before writes, canonical batch binding and failure propagation.

All created records belong to random fixture UUIDs. A `finally` block deletes only these local tenants/IDs in a transaction and asserts zero remaining orders, customers, purchase lines, purchases, stock, movements, profiles, Auth users, counters and organizations. Exit nonzero on failed checks or cleanup. Evidence is sanitized JSON (plus a failure screenshot only off the login page). Keep evidence outside git.

The pre-fix main reproduced customer duplication and stale batch dates through these forms. This is local evidence, not production verification. The historical cause of a manually entered wrong expiry remains UNKNOWN; no keystroke evidence exists. Purchase editing remains several database requests, not a new atomic RPC; on a mid-save failure the form reports an error and requests reload/inspection rather than claiming success.
