-- migration_030: make order_number uniqueness tenant-local
--
-- Было: orders.order_number was globally UNIQUE (orders_order_number_key),
-- while the only application read path that computes the next number
-- (createOrder, app/actions/orders.ts) runs through the session-bound,
-- RLS-subject Supabase client — its scan of existing order_number values
-- is therefore already tenant-local (RLS: orders_all USING organization_id
-- = get_user_organization_id()), even without an explicit .eq() filter.
-- The mismatch between a tenant-local *candidate* number and a globally
-- enforced *uniqueness* constraint meant any organization other than the
-- one already holding the low end of the number range could never create
-- an order: its RLS-visible max was always computed from its own history
-- only, so a new/second organization always recomputed the same already-
-- taken candidate (e.g. BW-0002) on every attempt, including every retry
-- — a permanent failure loop, not a transient race. Confirmed in
-- production (ORDER-NUMBER-TENANCY-A/A2/B1): organization B (1 order,
-- BW-0001) was permanently blocked from creating a second order because
-- BW-0002 already belonged to organization A (13 orders, BW-0002..0014).
--
-- Стало: uniqueness is scoped to (organization_id, order_number) instead
-- of order_number alone. Two different organizations may now legitimately
-- share the same visible order_number (e.g. org A's BW-0002 and org B's
-- BW-0002 both exist) — this is safe because order_number has never been
-- used anywhere in the codebase as an identity or lookup key; `id` (uuid)
-- is the sole identity used for joins, hrefs, and lookups throughout the
-- app (confirmed by exhaustive grep during ORDER-NUMBER-TENANCY-A).
--
-- Production status: this exact SQL was already applied manually in
-- Supabase Studio and verified before this migration file was written.
-- This file exists to bring the repo's migration history in sync with
-- production, not to apply anything new. Verified post-apply:
--   constraint name:       orders_organization_order_number_key
--   constraint definition: UNIQUE (organization_id, order_number)
--   total_orders          = 14
--   organizations_with_orders = 2
--   malformed_orders      = 0
-- No existing order_number values were changed; no rows were touched.
--
-- Explicitly out of scope for this migration (see ORDER-NUMBER-TENANCY-C,
-- not started): the order_number column DEFAULT (order_number_seq-based)
-- is unchanged; the underlying order_number_seq sequence is unchanged;
-- no counter table, RPC, trigger, RLS, or grant was added or modified;
-- no application code was changed. The JS-side MAX+1 scan in createOrder
-- remains in place and is still not concurrency-safe for two near-
-- simultaneous creates *within the same organization* (a real but
-- LOW-MEDIUM reliability issue, already surfaced to the user via a
-- specific, non-raw error message and resolved by a single manual
-- retry — not addressed here, tracked separately).
--
-- Rollback (only safe before any two organizations actually share a
-- duplicate order_number under the new constraint — see
-- ORDER-NUMBER-TENANCY-B1 §Rollback for why this becomes a one-way
-- door after that point; emergency reference only, do not apply as a
-- reaction to the fix working as intended):
--   begin;
--   alter table public.orders
--     drop constraint orders_organization_order_number_key;
--   alter table public.orders
--     add constraint orders_order_number_key
--     unique (order_number);
--   commit;

begin;

alter table public.orders
  drop constraint orders_order_number_key;

alter table public.orders
  add constraint orders_organization_order_number_key
  unique (organization_id, order_number);

commit;
