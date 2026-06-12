-- ─────────────────────────────────────────────────────────────────────────
-- migration_007_order_stock_rpc.sql
-- Атомарное списание склада по заказу
--
-- Добавляет RPC-функцию write_off_order_stock.
-- Зависит от:
--   migration_001_init.sql   (orders, get_user_organization_id)
--   migration_004_inventory_schema.sql (inventory_items, stock_movements)
--
-- Идемпотентна: CREATE OR REPLACE FUNCTION.
-- НЕ меняет RLS, схему таблиц или существующие данные.
-- ─────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- RPC: write_off_order_stock
--
-- Атомарно:
--   1. Проверяет права пользователя и состояние заказа.
--   2. Для каждой allocation: CAS-UPDATE inventory_items
--      (quantity_remaining -= quantity WHERE quantity_remaining >= quantity).
--   3. Вставляет движение 'sale' в stock_movements.
--   4. Ставит orders.stock_written_off = true.
--
-- Вызов:
--   SELECT write_off_order_stock(
--     p_order_id   := '<uuid>',
--     p_allocations := '[
--       {"inventory_item_id": "<uuid>", "flower_id": "<uuid>", "quantity": 5}
--     ]'
--   );
--
-- Возвращает: {"ok": true}
-- При любой ошибке поднимает exception → вся транзакция откатывается.
-- ════════════════════════════════════════════════════════════

create or replace function public.write_off_order_stock(
  p_order_id    uuid,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id         uuid;
  v_order_status   text;
  v_written_off    boolean;
  v_existing_count integer;
  v_alloc          jsonb;
  v_inventory_id   uuid;
  v_flower_id      uuid;
  v_quantity       integer;
  v_updated_count  integer;
begin
  -- 1. Определить организацию текущего пользователя (не доверять клиенту)
  v_org_id := get_user_organization_id();
  if v_org_id is null then
    raise exception 'Организация пользователя не найдена';
  end if;

  -- 2. Проверить p_allocations: не null, массив, непустой
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Allocations must be a JSON array';
  end if;

  if jsonb_array_length(p_allocations) = 0 then
    raise exception 'Allocations cannot be empty';
  end if;

  -- 3. Проверить заказ: существует, принадлежит организации, не отменён, не списан
  select status, stock_written_off
    into v_order_status, v_written_off
    from orders
   where id = p_order_id
     and organization_id = v_org_id;

  if not found then
    raise exception 'Заказ не найден или не принадлежит организации';
  end if;

  if v_order_status = 'cancelled' then
    raise exception 'Нельзя списать склад по отменённому заказу';
  end if;

  if v_written_off then
    raise exception 'Склад уже списан по этому заказу';
  end if;

  -- 4. Двойная защита: проверить отсутствие движений sale по этому заказу
  select count(*)
    into v_existing_count
    from stock_movements
   where organization_id = v_org_id
     and source_type      = 'order'
     and source_id        = p_order_id
     and movement_type    = 'sale';

  if v_existing_count > 0 then
    raise exception 'Движения списания уже существуют для этого заказа';
  end if;

  -- 5. Обработать каждую allocation
  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_inventory_id := (v_alloc->>'inventory_item_id')::uuid;
    v_flower_id    := (v_alloc->>'flower_id')::uuid;
    v_quantity     := (v_alloc->>'quantity')::integer;

    -- Валидация входных данных
    if v_inventory_id is null then
      raise exception 'inventory_item_id не может быть пустым';
    end if;
    if v_flower_id is null then
      raise exception 'flower_id не может быть пустым';
    end if;
    if v_quantity <= 0 then
      raise exception 'quantity должно быть больше 0';
    end if;

    -- CAS UPDATE: списываем только если партия найдена и остатка хватает
    update inventory_items
       set quantity_remaining = quantity_remaining - v_quantity,
           updated_at         = now()
     where id              = v_inventory_id
       and organization_id = v_org_id
       and flower_id       = v_flower_id
       and quantity_remaining >= v_quantity;

    get diagnostics v_updated_count = row_count;

    if v_updated_count = 0 then
      raise exception
        'Недостаточно остатка или партия не найдена: inventory_item_id=%, quantity=%',
        v_inventory_id, v_quantity;
    end if;

    -- Записать движение (append-only лог, никогда не удалять)
    insert into stock_movements (
      organization_id,
      inventory_item_id,
      flower_id,
      quantity,
      movement_type,
      source_type,
      source_id,
      comment
    ) values (
      v_org_id,
      v_inventory_id,
      v_flower_id,
      -v_quantity,
      'sale',
      'order',
      p_order_id,
      'Списание по заказу'
    );
  end loop;

  -- 6. Пометить заказ как списанный
  update orders
     set stock_written_off = true,
         updated_at        = now()
   where id              = p_order_id
     and organization_id = v_org_id;

  return '{"ok": true}'::jsonb;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- ПРАВА НА ВЫПОЛНЕНИЕ
-- Запретить всем через PUBLIC/anon, разрешить только authenticated.
-- ════════════════════════════════════════════════════════════

revoke all on function public.write_off_order_stock(uuid, jsonb) from public;
revoke all on function public.write_off_order_stock(uuid, jsonb) from anon;
grant execute on function public.write_off_order_stock(uuid, jsonb) to authenticated;
