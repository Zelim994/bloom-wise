-- migration_031: atomic, DB-authoritative per-organization order numbering
--
-- Было: createOrder (app/actions/orders.ts) computes the next order_number
-- by scanning existing rows (RLS-scoped to the caller's own organization
-- since migration_030, but still application-side) and taking MAX+1 in
-- JavaScript, then explicitly supplies that candidate on INSERT. Two
-- near-simultaneous creates within the SAME organization can compute the
-- same candidate; the composite UNIQUE(organization_id, order_number)
-- constraint (migration_030) correctly rejects the second one (23505),
-- already surfaced to the user as a specific, non-raw error message, and
-- a manual retry already succeeds — a real but LOW-MEDIUM reliability
-- issue, not a data-integrity bug (confirmed in
-- ORDER-NUMBER-TENANCY-A/A2/B1/C1).
--
-- Application-code evidence (re-verified in C1, not assumed): the
-- JS-computed candidate is used exactly once, as part of the orders
-- INSERT payload, and is never read again afterward — createOrder's
-- return value carries only `id`, never `order_number`; every surface
-- that displays a number (order detail, WhatsApp message, dashboard,
-- calendar, customer history) re-fetches it fresh from the database via
-- a separate, later read. This means a trigger silently overwriting the
-- candidate with a correct, DB-authoritative value is invisible and safe
-- to the rest of the application, with no code change required for it
-- to take effect.
--
-- Стало: a per-organization counter table plus a BEFORE INSERT trigger
-- on orders that atomically allocates the next number for
-- NEW.organization_id and overwrites NEW.order_number before the row is
-- written, replacing whatever candidate (if any) the caller supplied.
-- Because the counter mutation happens inside the same BEFORE ROW
-- trigger invocation as the orders INSERT it's attached to, it is part
-- of the exact same transaction: if the INSERT is subsequently rejected
-- for any reason (another constraint, RLS, anything), the counter
-- mutation rolls back with it — no number is ever burned by a failed
-- insert. Verified: PostgreSQL resolves column DEFAULTs and evaluates
-- NOT NULL constraints only *after* BEFORE ROW triggers run, so an
-- insert that omits order_number entirely (once the DEFAULT below is
-- dropped) still satisfies order_number's NOT NULL constraint, because
-- the trigger has already filled it in by the time that check runs.
--
-- Production data at the time of this migration (all confirmed via
-- manual read-only checks, not assumed):
--   total_orders = 14, organizations_with_orders = 2, malformed = 0
--   organization A: order_number range 2..14  → counter seeded at 14
--   organization B: order_number range 1..1   → counter seeded at 1
-- No existing order_number value is read, changed, or renumbered by
-- this migration. Organizations with zero orders receive no backfilled
-- counter row — the trigger's atomic upsert seeds one lazily, correctly,
-- on that organization's first future order (see function body).
--
-- Security model:
-- - organization_order_counters has RLS enabled and deliberately no
--   policy for authenticated/anon — matching this schema's existing
--   convention of relying on "RLS enabled + no applicable policy = deny
--   by default" for internal-only tables, rather than adding table-level
--   REVOKE statements (no such statements exist anywhere else in this
--   migration history for any table). The only path in is the trigger
--   function running as SECURITY DEFINER.
-- - assign_order_number() follows the exact shape already established
--   for this project's trigger functions (handle_new_user,
--   migration_001): `returns trigger language plpgsql security definer
--   set search_path = public`. No REVOKE/GRANT EXECUTE is added for it —
--   confirmed against the two existing trigger-function precedents in
--   migration_001 (handle_new_user, calc_batch_unit_cost), neither of
--   which has one either, because a function returning the `trigger`
--   pseudo-type cannot be invoked directly by client code (via
--   supabase.rpc() or SQL) in the first place — Postgres only allows it
--   to run as a trigger. Adding grants here would be inert noise, not
--   defense-in-depth.
-- - Defense-in-depth check inside the function: if the caller has a
--   resolvable organization (get_user_organization_id() is not null —
--   the ordinary authenticated case), NEW.organization_id must match it,
--   or the function raises. If the caller has no resolvable organization
--   (a superuser/service context with no auth.uid(), e.g. a manual
--   Studio statement run by the project owner), the check is skipped
--   entirely rather than blocking that trusted path — such contexts
--   bypass RLS by definition already and are not the threat model this
--   check exists for. This mirrors the shape you asked for explicitly
--   rather than an unconditional NULL-raising check. In the ordinary
--   authenticated case this check is redundant with orders_all's own
--   RLS WITH CHECK (organization_id = get_user_organization_id()), which
--   already rejects a mismatched insert outright before it could ever
--   commit — this is belt-and-suspenders, matching how every other
--   atomic RPC in this schema (create_writeoff_atomic, etc.) re-derives
--   and re-checks organization server-side rather than relying on RLS
--   alone.
--
-- Explicitly out of scope for this migration (not touched):
-- - existing order rows / order_number values — read-only, never
--   updated;
-- - the UNIQUE(organization_id, order_number) constraint from
--   migration_030 — unchanged, remains the final DB-level safety net
--   even if this trigger were ever bypassed or misconfigured;
-- - orders_all RLS policy — unchanged;
-- - customers, bouquets, inventory, WhatsApp — untouched;
-- - application code — createOrder still computes and sends its own
--   (now-discarded) JS candidate; removing that dead code is a separate,
--   optional cleanup (see ORDER-NUMBER-TENANCY-C4), not required for
--   this migration to be effective;
-- - order_number_seq — the underlying sequence object is left in place,
--   inert, exactly as it already was before this migration (only its
--   use as a column DEFAULT is removed, see below).
--
-- order_number DEFAULT: dropped. It is redundant now that the trigger
-- is always authoritative regardless of what (if anything) populated
-- NEW.order_number beforehand, and removing it prevents a latent,
-- purely wasteful side effect: sequence advancement (nextval()) is not
-- transactional and is not undone by the trigger's later overwrite, so
-- if some future insert path ever omitted order_number while the
-- DEFAULT was still in place, it would silently burn a value from
-- order_number_seq for no purpose every single time.
--
-- Rollback outline (reference only, not executed as part of this
-- migration; existing order rows are never touched by this migration in
-- either direction, so rollback here is materially simpler than
-- migration_030's constraint change):
--   begin;
--   drop trigger if exists orders_assign_order_number on public.orders;
--   drop function if exists public.assign_order_number();
--   drop table if exists public.organization_order_counters;
--   alter table public.orders alter column order_number
--     set default ('BW-' || lpad(nextval('order_number_seq')::text, 4, '0'));
--   commit;

begin;

-- 1. Internal per-organization counter table.
create table if not exists public.organization_order_counters (
  organization_id    uuid primary key references public.organizations(id) on delete cascade,
  last_order_number  integer not null default 0 check (last_order_number >= 0)
);

alter table public.organization_order_counters enable row level security;
-- Deliberately no policy: RLS enabled with zero applicable policies
-- denies all ordinary client access by default. See header comment.

-- 2. Backfill counters for organizations that already have orders.
--    Organizations with zero orders are seeded lazily by the trigger on
--    their first future order (see assign_order_number below).
insert into public.organization_order_counters (organization_id, last_order_number)
select
  organization_id,
  max((regexp_match(order_number, '^BW-(\d+)$'))[1]::int) as last_order_number
from public.orders
where order_number ~ '^BW-\d+$'
group by organization_id;

-- 3. Trigger function: atomically allocates and assigns the next
--    per-organization order number before the row is written.
create or replace function public.assign_order_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_org uuid := public.get_user_organization_id();
  v_next       integer;
begin
  if v_caller_org is not null and NEW.organization_id <> v_caller_org then
    raise exception 'organization mismatch: cannot allocate an order number for a different organization';
  end if;

  insert into public.organization_order_counters as c (organization_id, last_order_number)
  values (NEW.organization_id, 1)
  on conflict (organization_id) do update
  set last_order_number = c.last_order_number + 1
  returning c.last_order_number into v_next;

  -- lpad(string, length, fill) TRUNCATES on the right if string is already
  -- longer than length (unlike JS padStart) — a fixed length=4 would turn
  -- v_next=10000 into 'BW-1000', colliding with the real order BW-1000.
  -- greatest(4, length(...)) makes 4 a *minimum* width, never a max.
  NEW.order_number := 'BW-' || lpad(v_next::text, greatest(4, length(v_next::text)), '0');
  return NEW;
end;
$$;

-- 4. Attach the trigger. Always overwrites order_number regardless of
--    what (if anything) the caller supplied — see header comment on why
--    always-overwrite is correct for this codebase today.
drop trigger if exists orders_assign_order_number on public.orders;
create trigger orders_assign_order_number
  before insert on public.orders
  for each row execute procedure public.assign_order_number();

-- 5. The column default is now redundant and a latent footgun — see
--    header comment.
alter table public.orders alter column order_number drop default;

commit;
