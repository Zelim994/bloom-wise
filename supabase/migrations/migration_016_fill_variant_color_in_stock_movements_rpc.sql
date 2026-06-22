-- migration_016_fill_variant_color_in_stock_movements_rpc.sql
--
-- Обновляет три RPC так, чтобы INSERT в stock_movements заполнял
-- variety_id и color_id (добавлены миграцией 015).
--
-- Изменения в каждой функции:
--   create_purchase_atomic   — v_variety_id/v_color_id уже есть в DECLARE;
--                              добавлены в INSERT stock_movements ('purchase').
--   write_off_order_stock    — объявлены v_variety_id/v_color_id;
--                              SELECT из inventory_items внутри loop;
--                              добавлены в INSERT stock_movements ('sale').
--   return_order_stock       — объявлены v_variety_id/v_color_id;
--                              SELECT из inventory_items внутри loop;
--                              добавлены в INSERT stock_movements ('sale_return').
--
-- Сигнатуры функций, контракты JSON, логика остатков, RLS и таблицы НЕ меняются.
-- Применять только к dev DB до появления в production.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. create_purchase_atomic
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_purchase_atomic(
  p_supplier_name  text,
  p_supplier_phone text    DEFAULT NULL::text,
  p_purchase_date  date    DEFAULT CURRENT_DATE,
  p_comment        text    DEFAULT NULL::text,
  p_delivery_cost  numeric DEFAULT 0,
  p_items          jsonb   DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id            uuid;
  v_user_id           uuid;
  v_supplier_id       uuid;
  v_purchase_id       uuid;
  v_inventory_id      uuid;
  v_item              jsonb;
  v_flower_id         uuid;
  v_variety_id        uuid;
  v_color_id          uuid;
  v_quantity          int;
  v_cost_price        numeric;
  v_sale_price        numeric;
  v_expires_at        date;
  v_item_comment      text;
  v_total_qty         int;
  v_goods_total       numeric;
  v_delivery_per_unit numeric;
  v_effective_cost    numeric;
  v_extra_costs       numeric;
  v_total_amount      numeric;
  v_flower_exists     boolean;
  v_variety_ok        boolean;
  v_color_ok          boolean;
BEGIN

  v_org_id  := get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Организация пользователя не найдена';
  END IF;

  IF p_supplier_name IS NULL OR trim(p_supplier_name) = '' THEN
    RAISE EXCEPTION 'Имя поставщика не может быть пустым';
  END IF;

  IF p_purchase_date IS NULL THEN
    RAISE EXCEPTION 'Дата поставки не может быть пустой';
  END IF;

  IF p_delivery_cost < 0 THEN
    RAISE EXCEPTION 'Стоимость доставки не может быть отрицательной';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items должен быть JSON-массивом';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Список позиций не может быть пустым';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    IF (v_item->>'flower_id') IS NULL THEN
      RAISE EXCEPTION 'flower_id не может быть пустым в позиции';
    END IF;
    v_flower_id := (v_item->>'flower_id')::uuid;

    IF (v_item->>'quantity') IS NULL OR (v_item->>'quantity')::int <= 0 THEN
      RAISE EXCEPTION 'quantity должно быть > 0 (flower_id=%)', v_flower_id;
    END IF;

    IF (v_item->>'cost_price') IS NULL OR (v_item->>'cost_price')::numeric < 0 THEN
      RAISE EXCEPTION 'cost_price не может быть отрицательным (flower_id=%)', v_flower_id;
    END IF;

    IF (v_item->>'sale_price') IS NOT NULL
       AND (v_item->>'sale_price') <> ''
       AND (v_item->>'sale_price')::numeric < 0
    THEN
      RAISE EXCEPTION 'sale_price не может быть отрицательным (flower_id=%)', v_flower_id;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM flowers
       WHERE id              = v_flower_id
         AND organization_id = v_org_id
         AND is_active       = true
    ) INTO v_flower_exists;

    IF NOT v_flower_exists THEN
      RAISE EXCEPTION
        'Цветок не найден или не принадлежит организации: flower_id=%', v_flower_id;
    END IF;

    IF (v_item->>'variety_id') IS NOT NULL AND (v_item->>'variety_id') <> '' THEN
      SELECT EXISTS (
        SELECT 1
          FROM flower_varieties fv
          JOIN flowers f ON f.id = fv.flower_id
         WHERE fv.id              = (v_item->>'variety_id')::uuid
           AND fv.flower_id       = v_flower_id
           AND f.organization_id  = v_org_id
      ) INTO v_variety_ok;

      IF NOT v_variety_ok THEN
        RAISE EXCEPTION
          'Вариант не найден или не принадлежит товару/организации: variety_id=%, flower_id=%',
          (v_item->>'variety_id')::uuid, v_flower_id;
      END IF;
    END IF;

    IF (v_item->>'color_id') IS NOT NULL AND (v_item->>'color_id') <> '' THEN
      SELECT EXISTS (
        SELECT 1
          FROM flower_colors fc
          JOIN flowers f ON f.id = fc.flower_id
         WHERE fc.id             = (v_item->>'color_id')::uuid
           AND fc.flower_id      = v_flower_id
           AND f.organization_id = v_org_id
      ) INTO v_color_ok;

      IF NOT v_color_ok THEN
        RAISE EXCEPTION
          'Цвет не найден или не принадлежит товару/организации: color_id=%, flower_id=%',
          (v_item->>'color_id')::uuid, v_flower_id;
      END IF;
    END IF;

  END LOOP;

  SELECT id INTO v_supplier_id
    FROM suppliers
   WHERE organization_id = v_org_id
     AND lower(name)     = lower(trim(p_supplier_name))
   LIMIT 1;

  IF v_supplier_id IS NULL THEN
    INSERT INTO suppliers (
      organization_id, name, phone, is_active, created_by
    ) VALUES (
      v_org_id, trim(p_supplier_name), p_supplier_phone, true, v_user_id
    )
    RETURNING id INTO v_supplier_id;
  END IF;

  SELECT
    sum((item->>'quantity')::int * (item->>'cost_price')::numeric),
    sum((item->>'quantity')::int)
  INTO v_goods_total, v_total_qty
  FROM jsonb_array_elements(p_items) AS item;

  v_total_amount      := COALESCE(v_goods_total, 0) + COALESCE(p_delivery_cost, 0);
  v_delivery_per_unit := CASE
                           WHEN v_total_qty > 0
                           THEN COALESCE(p_delivery_cost, 0) / v_total_qty
                           ELSE 0
                         END;

  INSERT INTO purchases (
    organization_id, supplier_id, purchase_date, total_amount, comment, status, created_by
  ) VALUES (
    v_org_id, v_supplier_id, p_purchase_date, v_total_amount,
    NULLIF(trim(COALESCE(p_comment, '')), ''), 'confirmed', v_user_id
  )
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    v_flower_id  := (v_item->>'flower_id')::uuid;
    v_quantity   := (v_item->>'quantity')::int;
    v_cost_price := (v_item->>'cost_price')::numeric;

    v_variety_id := CASE
                      WHEN (v_item->>'variety_id') IS NOT NULL
                       AND (v_item->>'variety_id') <> ''
                      THEN (v_item->>'variety_id')::uuid
                      ELSE NULL
                    END;

    v_color_id := CASE
                    WHEN (v_item->>'color_id') IS NOT NULL
                     AND (v_item->>'color_id') <> ''
                    THEN (v_item->>'color_id')::uuid
                    ELSE NULL
                  END;

    v_sale_price := CASE
                      WHEN (v_item->>'sale_price') IS NOT NULL
                       AND (v_item->>'sale_price') <> ''
                       AND (v_item->>'sale_price')::numeric > 0
                      THEN (v_item->>'sale_price')::numeric
                      ELSE NULL
                    END;

    v_expires_at := CASE
                      WHEN (v_item->>'expires_at') IS NOT NULL
                       AND (v_item->>'expires_at') <> ''
                      THEN (v_item->>'expires_at')::date
                      ELSE NULL
                    END;

    v_item_comment   := NULLIF(trim(COALESCE(v_item->>'comment', '')), '');
    v_effective_cost := v_cost_price + v_delivery_per_unit;
    v_extra_costs    := round(v_delivery_per_unit * v_quantity * 100) / 100;

    INSERT INTO inventory_items (
      organization_id, flower_id, supplier_id, arrived_at,
      cost_price, quantity_in, quantity_remaining, expires_at,
      freshness_status, purchase_id, variety_id, color_id, created_by
    ) VALUES (
      v_org_id, v_flower_id, v_supplier_id, p_purchase_date,
      v_effective_cost, v_quantity, v_quantity, v_expires_at,
      'fresh', v_purchase_id, v_variety_id, v_color_id, v_user_id
    )
    RETURNING id INTO v_inventory_id;

    -- variety_id/color_id берём из тех же переменных, что и для inventory_items
    INSERT INTO stock_movements (
      organization_id, flower_id, inventory_item_id, quantity,
      movement_type, source_type, source_id, comment, created_by,
      variety_id, color_id
    ) VALUES (
      v_org_id, v_flower_id, v_inventory_id, v_quantity,
      'purchase', 'purchase', v_purchase_id, v_item_comment, v_user_id,
      v_variety_id, v_color_id
    );

    INSERT INTO purchase_items (
      purchase_id, flower_id, inventory_item_id, quantity,
      cost_price, extra_costs, expires_at, comment
    ) VALUES (
      v_purchase_id, v_flower_id, v_inventory_id, v_quantity,
      v_cost_price, v_extra_costs, v_expires_at, v_item_comment
    );

    IF v_sale_price IS NOT NULL THEN
      UPDATE flowers
         SET sale_price = v_sale_price,
             updated_at = now()
       WHERE id = v_flower_id AND organization_id = v_org_id;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('purchase_id', v_purchase_id);

END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. write_off_order_stock
-- ═══════════════════════════════════════════════════════════════════════════

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
     and organization_id = v_org_id;

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
