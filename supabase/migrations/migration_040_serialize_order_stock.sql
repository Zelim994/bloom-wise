-- Serialize each order before checking flags or touching batches.
-- CREATE OR REPLACE preserves existing owner and EXECUTE ACL.
-- No table, role, grant or historical migration changes.

CREATE OR REPLACE FUNCTION public.write_off_order_stock(
  p_order_id    uuid,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_variety_id     uuid;
  v_color_id       uuid;
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
     and organization_id = v_org_id
   for update;

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

    -- Взять variety/color из inventory_items — источник правды о партии
    select variety_id, color_id
      into v_variety_id, v_color_id
      from public.inventory_items
     where id = v_inventory_id;

    -- Записать движение (append-only лог, никогда не удалять)
    insert into stock_movements (
      organization_id,
      inventory_item_id,
      flower_id,
      quantity,
      movement_type,
      source_type,
      source_id,
      comment,
      variety_id,
      color_id
    ) values (
      v_org_id,
      v_inventory_id,
      v_flower_id,
      -v_quantity,
      'sale',
      'order',
      p_order_id,
      'Списание по заказу',
      v_variety_id,
      v_color_id
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
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. return_order_stock
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.return_order_stock(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org_id          uuid;
  v_written_off     boolean;
  v_returned        boolean;
  v_existing_count  integer;
  v_sale_count      integer;
  v_return_qty      integer;
  v_updated_count   integer;
  v_sale_rec        record;
  v_variety_id      uuid;
  v_color_id        uuid;
begin
  -- 1. Resolve organisation from current JWT
  v_org_id := get_user_organization_id();
  if v_org_id is null then
    raise exception 'Организация пользователя не найдена';
  end if;

  -- 2. Validate input
  if p_order_id is null then
    raise exception 'p_order_id не может быть null';
  end if;

  -- 3. Verify order belongs to org and load key flags
  select stock_written_off, stock_returned
    into v_written_off, v_returned
    from orders
   where id = p_order_id
     and organization_id = v_org_id
   for update;

  if not found then
    raise exception 'Заказ не найден или не принадлежит организации';
  end if;

  if not v_written_off then
    raise exception 'Склад не был списан по этому заказу — возврат невозможен';
  end if;

  if v_returned then
    raise exception 'Склад уже был возвращён по этому заказу';
  end if;

  -- 4. Double guard: no existing sale_return movements for this order
  select count(*) into v_existing_count
    from stock_movements
   where organization_id = v_org_id
     and source_type     = 'order'
     and source_id       = p_order_id
     and movement_type   = 'sale_return';

  if v_existing_count > 0 then
    raise exception 'Движения возврата уже существуют для этого заказа';
  end if;

  -- 5. Count sale movements — must have at least one
  select count(*) into v_sale_count
    from stock_movements
   where organization_id = v_org_id
     and source_type     = 'order'
     and source_id       = p_order_id
     and movement_type   = 'sale';

  if v_sale_count = 0 then
    raise exception 'Движения списания не найдены для этого заказа';
  end if;

  -- 6. Process each sale movement
  for v_sale_rec in
    select id, inventory_item_id, flower_id, quantity
      from stock_movements
     where organization_id = v_org_id
       and source_type     = 'order'
       and source_id       = p_order_id
       and movement_type   = 'sale'
  loop
    if v_sale_rec.quantity >= 0 then
      raise exception 'Движение списания имеет неотрицательное quantity: id=%, quantity=%',
        v_sale_rec.id, v_sale_rec.quantity;
    end if;

    v_return_qty := abs(v_sale_rec.quantity);

    -- Increase inventory batch
    update inventory_items
       set quantity_remaining = quantity_remaining + v_return_qty,
           updated_at         = now()
     where id              = v_sale_rec.inventory_item_id
       and organization_id = v_org_id
       and flower_id       = v_sale_rec.flower_id;

    get diagnostics v_updated_count = row_count;

    if v_updated_count = 0 then
      raise exception 'Партия не найдена для возврата: inventory_item_id=%, flower_id=%',
        v_sale_rec.inventory_item_id, v_sale_rec.flower_id;
    end if;

    -- Взять variety/color из inventory_items — источник правды о партии
    select variety_id, color_id
      into v_variety_id, v_color_id
      from public.inventory_items
     where id = v_sale_rec.inventory_item_id;

    -- Append compensating movement
    insert into stock_movements (
      organization_id,
      inventory_item_id,
      flower_id,
      quantity,
      movement_type,
      source_type,
      source_id,
      comment,
      variety_id,
      color_id
    ) values (
      v_org_id,
      v_sale_rec.inventory_item_id,
      v_sale_rec.flower_id,
      v_return_qty,
      'sale_return',
      'order',
      p_order_id,
      'Возврат склада по отменённому заказу',
      v_variety_id,
      v_color_id
    );
  end loop;

  -- 7. Mark order cancelled and returned
  update orders
     set status         = 'cancelled',
         stock_returned = true,
         updated_at     = now()
   where id              = p_order_id
     and organization_id = v_org_id;

  return jsonb_build_object('ok', true);
end;
$function$;
