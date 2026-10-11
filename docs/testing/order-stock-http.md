# Local stock concurrency through HTTP

Run `npm ci`, `npx playwright install chromium`, and ensure the existing isolated
BloomWise stack is running (`npm run e2e:db:check`; never reset it). Use Node
24.15.0. SQL040 must already be installed locally: the harness verifies both
function definition hashes. The previous release applied it; this test never
applies a migration. No new dependencies are required.

```sh
BLOOMWISE_HTTP_EVIDENCE_DIR=/absolute/private/evidence/directory npm run test:browser:order-stock-http
```

Use a dedicated checkout with no `.env*` files and no Next server already running.
The harness starts its own Next development server on a free loopback port and
isolated headless Playwright Chromium, not a user Chrome profile. Supabase is
fixed to 127.0.0.1:54421 and PostgreSQL to 54422. The existing wrapper validates
config/environment/container separation; both DB connections verify the canonical
local database. Local keys are read from read-only CLI status in memory. Only the
local anon key reaches Next. Local service role is used **only** to create three
confirmed synthetic Auth users; stock operations use real browser password login
and authenticated sessions, not service role. No email is sent.

## Covered path

Real login form → GoTrue → browser session → actual order buttons and confirmation
dialog → Next proxy/auth checks → real Server Actions `writeOffOrderStock` or
`cancelOrder` → organization lookup and allocation/conditional-update service →
authenticated PostgREST → SQL040 → database. There are no mocked actions, added
application endpoints, direct stock RPC calls from the test administrator or
replacement SQL functions. Fixtures are seeded administratively: this suite does
**not** claim to test order creation forms or a production build/proxy.

Two different florist accounts in one synthetic organization use separate browser
contexts. A third florist belongs to another synthetic organization.

## Deterministic overlap

An administrative control transaction locks exactly the new order row, or the
new inventory batch for the two-order case. It does not perform stock operations.
After clicking the first button an independent observer requires one authenticator
backend waiting on that transaction. After the second click it requires two
**distinct** backend PIDs with `wait_event_type=Lock`, each blocking chain reaching
the held transaction. The expected operation labels (writeoff RPC, return RPC or
conditional order UPDATE) are asserted, then the barrier is released. The second
waiter can be blocked indirectly by the first tuple waiter. Polling bounds the
observation; elapsed time/Promise.all alone never proves overlap. No unrelated
backend is terminated. Failure to observe the lock graph fails the test.

Cases: double writeoff; two orders needing 3 each from a batch of 5; double return
through cancellation; writeoff then cancellation; cancellation then writeoff.
Responses, actual rendered domain errors, final order flags/status, batch balances,
per-order movement quantities and absence of duplicate batch/type movements are
checked independently. Stock must stay nonnegative; batch conservation and
per-order requested quantity must hold. A rejected operation has no partial effect.

Next RSC response bodies are kept only in memory. Only ASCII `ok` and HTTP status
are parsed from the protocol: Chromium CDP can decode Cyrillic text/x-component
responses differently from browser fetch. Domain errors are asserted in the actual
rendered UI, avoiding that observer encoding artifact.

## Lost response and isolation

For one writeoff, Playwright `route.fetch` forwards the real HTTP request to Next,
waits for its response and independently confirms the committed DB state. The
browser delivery is then aborted. This is an explicit response-loss simulation
with a Node HTTP forwarding leg, not a physical network outage. The page reloads
and shows written-off stock; state is identical and exactly one action POST was
made. No automatic resubmit is accepted.

The foreign organization must see the application's actual not-found page. A real
HTTP Server Action POST with the captured nonsecret action identifier/order payload
(but the **foreign browser's own session**) must return `Заказ не найден`, with all
source-organization state unchanged. No cookies or tokens are extracted.

## Evidence and cleanup

No screenshots, HAR, tracing, cookies, headers, passwords, tokens, raw RSC payloads
or server logs are saved. Evidence contains synthetic UUIDs, lock PIDs/operation
labels, status/expected UI messages, snapshots and cleanup counts. Error output is
restricted to stage/type/SQLSTATE and source line locations; diagnostics never echo
credential inputs.

Finally: release barrier, close the isolated browser, stop only the created Next
process, revoke sessions for exact synthetic user UUIDs and delete only the two
new fixture organizations' data and users in a transaction. Validated cascades and
zero-count assertions cover users, sessions, profiles, organizations, orders,
batches, movements, flowers, bouquets, items and counters. Retained production
accounts are never a target. No stack reset or marker-prefix deletion is used.

As with any process, SIGKILL/machine loss cannot execute `finally`. Keep the unique
evidence directory: the saved organization/user UUID manifest is the recovery
allowlist. Verify the full tag/tenant ownership first, stop only this run's server,
then perform the same exact-UUID cleanup and save a separate recovery receipt.
Do not remove other runs' data or silently mark an interrupted run PASS.

Production E2E is a separate approval package. This suite neither creates production
data nor proves production concurrency. Normal GitHub CI runs unit/lint/typecheck/
build; the HTTP suite additionally needs the isolated local stack and Chromium.
