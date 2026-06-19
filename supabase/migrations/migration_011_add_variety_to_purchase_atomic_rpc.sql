-- ─────────────────────────────────────────────────────────────────────────
-- migration_011_add_variety_to_purchase_atomic_rpc.sql
-- Добавляет поддержку variety_id и color_id в create_purchase_atomic.
--
-- Каждая позиция p_items теперь может содержать:
--   variety_id  uuid (optional) — ссылка на flower_varieties.id
--   color_id    uuid (optional) — ссылка на flower_colors.id
--
-- Валидация variety_id:
--   flower_varieties.flower_id = p_flower_id
--   + flowers.organization_id = v_org_id
--
-- Валидация color_id:
--   flower_colors.flower_id = p_flower_id
--   + flowers.organization_id = v_org_id
--
-- Оба поля записываются в inventory_items.variety_id / inventory_items.color_id
-- (колонки уже существуют в схеме с migration_004).
--
-- Зависит от: migration_010_fix_purchase_atomic_rpc.sql
-- Идемпотентна: CREATE OR REPLACE FUNCTION.
-- НЕ меняет RLS, схему таблиц, политики или существующие данные.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_purchase_atomic(
  p_supplier_name  text,
  p_supplier_phone text    DEFAULT NULL,
  p_purchase_date  date    DEFAULT CURRENT_DATE,
  p_comment        text    DEFAULT NULL,
  p_delivery_cost  numeric DEFAULT 0,
  p_items          jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
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

  -- ── 1. Получить organization_id через безопасный хелпер ─────────────────
  v_org_id  := get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Организация пользователя не найдена';
  END IF;

  -- ── 2. Валидация верхнеуровневых параметров ──────────────────────────────
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

  -- ── 3. Валидация каждой позиции (до любых записей в БД) ─────────────────
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

    -- Если передан variety_id — проверить принадлежность к flower и org
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

    -- Если передан color_id — проверить принадлежность к flower и org
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

  -- ── 4. Найти или создать поставщика ─────────────────────────────────────
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

  -- ── 5. Вычислить итоговые суммы ──────────────────────────────────────────
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

  -- ── 6. Создать запись поставки ───────────────────────────────────────────
  INSERT INTO purchases (
    organization_id, supplier_id, purchase_date, total_amount, comment, status, created_by
  ) VALUES (
    v_org_id, v_supplier_id, p_purchase_date, v_total_amount,
    NULLIF(trim(COALESCE(p_comment, '')), ''), 'confirmed', v_user_id
  )
  RETURNING id INTO v_purchase_id;

  -- ── 7. Создать позиции ───────────────────────────────────────────────────
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

    -- 7a. Создать партию (inventory_items)
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

    -- 7b. Записать движение склада (append-only лог, не удалять)
    INSERT INTO stock_movements (
      organization_id, flower_id, inventory_item_id, quantity,
      movement_type, source_type, source_id, comment, created_by
    ) VALUES (
      v_org_id, v_flower_id, v_inventory_id, v_quantity,
      'purchase', 'purchase', v_purchase_id, v_item_comment, v_user_id
    );

    -- 7c. Создать позицию поставки
    INSERT INTO purchase_items (
      purchase_id, flower_id, inventory_item_id, quantity,
      cost_price, extra_costs, expires_at, comment
    ) VALUES (
      v_purchase_id, v_flower_id, v_inventory_id, v_quantity,
      v_cost_price, v_extra_costs, v_expires_at, v_item_comment
    );

    -- 7d. Обновить цену продажи в каталоге (только если передана > 0)
    IF v_sale_price IS NOT NULL THEN
      UPDATE flowers
         SET sale_price = v_sale_price,
             updated_at = now()
       WHERE id = v_flower_id AND organization_id = v_org_id;
    END IF;

  END LOOP;

  -- ── 8. Вернуть ID созданной поставки ─────────────────────────────────────
  RETURN jsonb_build_object('purchase_id', v_purchase_id);

END;
$$;

-- ════════════════════════════════════════════════════════════
-- ПРАВА НА ВЫПОЛНЕНИЕ
-- ════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.create_purchase_atomic(text, text, date, text, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_purchase_atomic(text, text, date, text, numeric, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_purchase_atomic(text, text, date, text, numeric, jsonb) TO authenticated;
