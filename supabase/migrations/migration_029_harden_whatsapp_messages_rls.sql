-- migration_029: harden whatsapp_messages tenant RLS
--
-- Direct precedent: migration_028_harden_bouquets_tenant_rls.sql fixed
-- the structurally identical bypass on bouquets/bouquet_items. This
-- migration applies the exact same shape to the one remaining table
-- with the same pattern (found and scoped out on purpose in
-- BOUQUETS-RLS-SECURITY-A, audited in full in WHATSAPP-RLS-SECURITY-A).
--
-- Было (migration_001, live DB):
-- whatsapp_all разрешала "order_id is null" как безусловный bypass
-- организационной границы:
--   create policy "whatsapp_all" on whatsapp_messages
--     for all using (
--       order_id is null
--       or exists (select 1 from orders o where o.id = whatsapp_messages.order_id
--                  and o.organization_id = get_user_organization_id())
--     );
-- WITH CHECK явно не задавался — для FOR ALL это означает, что USING
-- переиспользуется как write-check, то есть один и тот же bypass работал
-- для SELECT, INSERT, UPDATE и DELETE одинаково. Policy не была
-- ограничена `to authenticated` (по умолчанию — PUBLIC); table grants на
-- anon подтверждены вручную (SELECT/INSERT/UPDATE/DELETE и др.) — при
-- отсутствии applicable policy для anon это не давало anon доступа
-- (RLS enabled = deny by default при отсутствии policy для роли), но
-- делало эту policy единственной линией защиты для двух ролей сразу.
--
-- Практическое следствие: любой authenticated пользователь любой
-- организации мог через обычный Supabase client:
--   - вставить "standalone" message (order_id = null) и получить строку,
--     видимую/редактируемую/удаляемую всеми организациями;
--   - взять СВОЙ реальный message, принадлежащий своему order, и одним
--     UPDATE выставить order_id = null ("detach"), мгновенно выведя его
--     (реальные phone/message — имя клиента, номер, сумма заказа, время
--     готовности) из tenant boundary.
--
-- Production preflight (выполнен вручную в Supabase SQL Editor перед
-- этой миграцией, до применения):
--   total_messages       = 2
--   linked_messages       = 2
--   standalone_messages   = 0
--   orphan_messages        = 0
-- Реальный data invariant подтверждён: whatsapp_message → order →
-- organization выполняется для 100% существующих строк.
--
-- Application invariant (подтверждён по коду, app/actions/orders.ts,
-- sendWhatsAppMessage): orderId — обязательный, non-optional параметр;
-- insert всегда содержит реальный order_id. Ни один код-путь не
-- создаёт standalone message. Таблица нигде не читается приложением —
-- только write (send log).
--
-- Стало:
-- - whatsapp_all переписана в том же виде exists(), что уже применено
--   в migration_028 для bouquets_all/bouquet_items_all — без
--   "or order_id is null", без escape hatch;
-- - добавлен явный WITH CHECK (был структурно отсутствующим), поэтому
--   NEW-строка тоже обязана ссылаться на order своей организации — это
--   закрывает detach (order_id → null) и reassignment (order A → order B),
--   а не только INSERT;
-- - policy явно ограничена `to authenticated` (ранее — implicit PUBLIC);
-- - membership predicate не изобретён заново — используется canonical
--   get_user_organization_id(), как и во всех остальных policies схемы.
--
-- Явно НЕ входит в этот hotfix:
-- - table grants (anon/authenticated) не меняются. RLS enabled + policy
--   scoped `to authenticated` уже означает: для anon нет applicable
--   policy → любая операция anon denied by RLS независимо от table
--   grants (стандартная семантика Postgres row security: "row security
--   is not enabled by default... if enabled, all normal access is
--   denied and must be explicitly allowed via policy" — grant без
--   подходящей policy доступа не даёт). REVOKE не требуется и не
--   выполняется;
-- - organization_id в whatsapp_messages не добавляется — реальный
--   app-workflow не создаёт standalone messages, и, в отличие от
--   bouquets (is_display/recipe_id), в схеме нет никаких признаков
--   того, что standalone messages когда-либо были задуманы как
--   продуктовая фича;
-- - customer_id не добавляется — колонки не существует, tenant-binding
--   через customer сейчас архитектурно невозможен без schema change;
-- - FK whatsapp_messages.order_id остаётся "on delete set null" как
--   есть — НЕ меняется на cascade. Это осознанно оставленный
--   future-risk: если приложение когда-либо начнёт физически удалять
--   order (сейчас не делает — подтверждено по коду), FK автоматически
--   обнулит order_id у связанных messages, и после этой миграции такие
--   строки станут недоступны обычным пользователям через RLS (как и
--   их собственной организации). Это отдельное будущее решение о
--   модели данных, не часть этого security hotfix;
-- - table grants не трогаются (без REVOKE/GRANT) — RLS-уровня policy
--   достаточно;
-- - silent insert-error в sendWhatsAppMessage (результат insert не
--   проверяется) не исправляется здесь — отдельный future finding
--   WHATSAPP-RELIABILITY-A, не security и не часть этой миграции;
-- - роли (owner/admin/florist/cashier/viewer) не различались этой
--   policy раньше и не начинают различаться сейчас.
--
-- Rollback (восстановление исходного поведения, только для
-- аварийного service recovery, НЕ как реакция на попытку эксплуатации):
--   begin;
--   drop policy if exists "whatsapp_all" on public.whatsapp_messages;
--   create policy "whatsapp_all" on public.whatsapp_messages
--     for all using (
--       order_id is null
--       or exists (
--         select 1 from public.orders o
--         where o.id = whatsapp_messages.order_id
--           and o.organization_id = get_user_organization_id()
--       )
--     );
--   commit;

begin;

drop policy if exists "whatsapp_all" on public.whatsapp_messages;

create policy "whatsapp_all"
  on public.whatsapp_messages
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = whatsapp_messages.order_id
        and o.organization_id = get_user_organization_id()
    )
  )
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = whatsapp_messages.order_id
        and o.organization_id = get_user_organization_id()
    )
  );

commit;
