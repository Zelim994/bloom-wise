-- migration_028: harden bouquets / bouquet_items tenant RLS
--
-- Было (migration_001, live DB):
-- bouquets_all и bouquet_items_all разрешали "order_id is null" как
-- безусловный bypass организационной границы:
--   bouquets_all:
--     for all using (
--       order_id is null
--       or exists (select 1 from orders o where o.id = bouquets.order_id
--                  and o.organization_id = get_user_organization_id())
--     )
--   bouquet_items_all: тот же bypass, унаследованный через parent bouquet
--     (order_id is null у родительского bouquet).
-- WITH CHECK явно не задавался — для FOR ALL это означает, что USING
-- переиспользуется как write-check, то есть один и тот же bypass работал
-- для SELECT, INSERT, UPDATE и DELETE одинаково. Policy не была
-- ограничена `to authenticated` (по умолчанию — PUBLIC).
--
-- Практическое следствие: любой authenticated пользователь любой
-- организации мог через обычный Supabase client:
--   - вставить "standalone" bouquet (order_id = null) и получить строку,
--     видимую/редактируемую/удаляемую всеми организациями;
--   - что важнее — взять СВОЙ реальный bouquet, принадлежащий своему
--     order, и одним UPDATE выставить order_id = null ("detach"),
--     мгновенно выведя его (и его bouquet_items — реальные цены,
--     себестоимость, комментарии флориста) из tenant boundary.
-- Обнаружено и подтверждено в BOUQUETS-RLS-SECURITY-A / B1.
--
-- Production preflight (выполнен вручную в Supabase SQL Editor
-- перед этой миграцией, до применения):
--   total_bouquets            = 13
--   linked_bouquets            = 13
--   standalone_bouquets        = 0
--   standalone_bouquet_items   = 0
--   orphan_bouquets            = 0
-- Реальный data invariant подтверждён: bouquet → order → organization
-- выполняется для 100% существующих строк.
--
-- Application invariant (подтверждён по коду, app/actions/orders.ts):
-- order всегда создаётся раньше bouquet (createOrder: insert orders →
-- читаем id → insert bouquets с этим order_id); update bouquet никогда
-- не трогает order_id. Ни один код-путь не создаёт standalone bouquet.
--
-- Стало:
-- - bouquets_all / bouquet_items_all переписаны в том же виде exists(),
--   что уже используется purchase_items_all и recipe_items_all в этом
--   же файле — без "or order_id is null", без escape hatch;
-- - добавлен явный WITH CHECK (был структурно отсутствующим), поэтому
--   NEW-строка теперь тоже обязана ссылаться на order своей организации —
--   это закрывает detach (order_id → null) и reattach (order A → order B
--   / bouquet_item.bouquet_id → чужой bouquet), а не только INSERT;
-- - policies явно ограничены `to authenticated` (ранее — implicit
--   PUBLIC), что закрывает и anonymous-доступ через RLS-механизм
--   "нет применимой policy для роли = deny", без изменения table grants;
-- - membership predicate не изобретён заново — используется canonical
--   get_user_organization_id(), как и во всех остальных policies схемы.
--
-- Явно НЕ входит в этот hotfix (см. BOUQUETS-RLS-SECURITY-A):
-- - organization_id в bouquets/bouquet_items не добавляется — реальный
--   app-workflow не создаёт standalone bouquets, поэтому чисто
--   RLS-фикс безопасен и не требует schema change; architecture upgrade
--   (bouquets.organization_id) остаётся отдельным future stage, только
--   если standalone/display bouquet когда-либо будет реально реализован;
-- - whatsapp_messages имеет структурно идентичный bypass (order_id is
--   null), но НЕ затрагивается этой миграцией — отдельный follow-up
--   WHATSAPP-RLS-SECURITY-A;
-- - роли (owner/admin/florist/cashier/viewer) не различались этой
--   policy раньше и не начинают различаться сейчас — меняется только
--   tenant boundary, не who-within-org-can-do-what.
--
-- Rollback (восстановление исходного поведения, только для
-- аварийного service recovery, НЕ как реакция на попытку эксплуатации):
--   begin;
--   drop policy if exists "bouquets_all" on public.bouquets;
--   create policy "bouquets_all" on public.bouquets
--     for all using (
--       order_id is null  -- витринный/отдельный букет
--       or exists (
--         select 1 from public.orders o
--         where o.id = bouquets.order_id
--           and o.organization_id = get_user_organization_id()
--       )
--     );
--   drop policy if exists "bouquet_items_all" on public.bouquet_items;
--   create policy "bouquet_items_all" on public.bouquet_items
--     for all using (
--       exists (
--         select 1 from public.bouquets b
--         left join public.orders o on o.id = b.order_id
--         where b.id = bouquet_items.bouquet_id
--           and (b.order_id is null or o.organization_id = get_user_organization_id())
--       )
--     );
--   commit;

begin;

drop policy if exists "bouquets_all" on public.bouquets;

create policy "bouquets_all"
  on public.bouquets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = bouquets.order_id
        and o.organization_id = get_user_organization_id()
    )
  )
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = bouquets.order_id
        and o.organization_id = get_user_organization_id()
    )
  );

drop policy if exists "bouquet_items_all" on public.bouquet_items;

create policy "bouquet_items_all"
  on public.bouquet_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.bouquets b
      join public.orders o on o.id = b.order_id
      where b.id = bouquet_items.bouquet_id
        and o.organization_id = get_user_organization_id()
    )
  )
  with check (
    exists (
      select 1
      from public.bouquets b
      join public.orders o on o.id = b.order_id
      where b.id = bouquet_items.bouquet_id
        and o.organization_id = get_user_organization_id()
    )
  );

commit;
