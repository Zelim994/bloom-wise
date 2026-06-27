-- ─────────────────────────────────────────────────────────────────────────
-- migration_024_create_writeoff_atomic_rpc.sql
-- Атомарное ручное списание склада.
--
-- Зависит от:
--   migration_001_init.sql            (get_user_organization_id)
--   migration_004_inventory_schema.sql (inventory_items, stock_movements)
--   migration_006_writeoffs.sql        (writeoffs)
--
-- Идемпотентна: CREATE OR REPLACE FUNCTION.
-- НЕ меняет RLS, схему таблиц, политики или существующие данные.
-- SQL к live DB НЕ применять без явного подтверждения.
-- ─────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- RPC: create_writeoff_atomic
--
-- Атомарно выполняет для каждой позиции в одной транзакции:
--   1. Проверяет организацию через get_user_organization_id() — не доверять клиенту.
--   2. Для каждой позиции:
--      a. CAS-UPDATE inventory_items:
--           SET quantity_remaining = quantity_remaining - quantity
--           WHERE id = inventory_item_id
--             AND organization_id = v_org_id
--             AND quantity_remaining >= quantity
--           RETURNING flower_id, variety_id, color_id, cost_price
--         Если 0 строк → RAISE EXCEPTION (недостаточно остатка / чужая партия).
--      b. INSERT INTO writeoffs — flower_id / variety_id / color_id
--         берутся из RETURNING, не из payload.
--      c. INSERT INTO stock_movements (append-only, never DELETE)
--         quantity = -N, movement_type = 'writeoff'.
--   3. При любой ошибке → RAISE EXCEPTION → PostgreSQL откатывает всю транзакцию.
--   4. Возвращает {"success": true, "writeoff_count": N, "movement_count": N}.
--
-- Параметры:
--   p_writeoff_date  date   — дата акта (обязательно)
--   p_comment        text   — комментарий к акту (опционально)
--   p_items          jsonb  — массив позиций (обязательно, не пустой)
--
-- Формат p_items (массив объектов):
--   inventory_item_id  uuid     — обязательно (партия)
--   quantity           integer  — обязательно, > 0
--   reason             text     — опционально (причина списания)
--   comment            text     — опционально (переопределяет p_comment для позиции)
--   loss_amount        numeric  — опционально (если не указан, = cost_price * quantity)
--
-- НЕ принимает из payload:
--   flower_id   — берётся из inventory_items (источник истины)
--   variety_id  — берётся из inventory_items
--   color_id    — берётся из inventory_items
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_writeoff_atomic(
  p_writeoff_date  date,
  p_comment        text,
  p_items          jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id         uuid;
  v_item           jsonb;
  v_inv_id         uuid;
  v_quantity       integer;
  v_reason         text;
  v_item_comment   text;
  v_loss_amount    numeric;
  -- Поля из inventory_items (источник истины, не из payload)
  v_flower_id      uuid;
  v_variety_id     uuid;
  v_color_id       uuid;
  v_cost_price     numeric;
  v_writeoff_id    uuid;
  v_writeoff_count integer := 0;
BEGIN

  -- 1. Получить org_id через server-side function (не доверять клиенту)
  v_org_id := get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Организация пользователя не найдена';
  END IF;

  -- 2. Проверить p_writeoff_date
  IF p_writeoff_date IS NULL THEN
    RAISE EXCEPTION 'Дата акта (p_writeoff_date) обязательна';
  END IF;

  -- 3. Проверить p_items: JSON array, не пустой
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items должен быть JSON массивом';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Список позиций не может быть пустым';
  END IF;

  -- 4. Обработать каждую позицию
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Извлечь поля из payload
    v_inv_id       := (v_item->>'inventory_item_id')::uuid;
    v_quantity     := (v_item->>'quantity')::integer;
    v_reason       := nullif(trim(v_item->>'reason'), '');
    v_item_comment := nullif(trim(v_item->>'comment'), '');
    v_loss_amount  := (v_item->>'loss_amount')::numeric;

    -- Валидация обязательных полей
    IF v_inv_id IS NULL THEN
      RAISE EXCEPTION 'inventory_item_id обязателен в каждой позиции';
    END IF;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'quantity должно быть положительным числом (inventory_item_id=%)', v_inv_id;
    END IF;

    -- ── Ключевой шаг: CAS-UPDATE ─────────────────────────────────────────
    -- Атомарно:
    --   • Проверяет organization_id (cross-org protection)
    --   • Проверяет quantity_remaining >= v_quantity (overdraft protection)
    --   • Уменьшает quantity_remaining
    --   • Возвращает flower_id / variety_id / color_id / cost_price из БД
    --     (не доверяем клиенту)
    -- Если 0 строк: партия не найдена / чужая / остатка недостаточно → exception
    UPDATE inventory_items
       SET quantity_remaining = quantity_remaining - v_quantity,
           updated_at         = now()
     WHERE id              = v_inv_id
       AND organization_id = v_org_id
       AND quantity_remaining >= v_quantity
    RETURNING flower_id, variety_id, color_id, cost_price
         INTO v_flower_id, v_variety_id, v_color_id, v_cost_price;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Недостаточно остатка или партия не найдена: inventory_item_id=%, quantity=%',
        v_inv_id, v_quantity;
    END IF;

    -- Если loss_amount не передан или = 0, вычислить из cost_price × quantity
    IF v_loss_amount IS NULL OR v_loss_amount = 0 THEN
      v_loss_amount := v_cost_price * v_quantity;
    END IF;

    -- ── INSERT INTO writeoffs ─────────────────────────────────────────────
    INSERT INTO writeoffs (
      organization_id,
      flower_id,
      inventory_item_id,
      quantity,
      reason,
      comment,
      writeoff_date,
      loss_amount
    ) VALUES (
      v_org_id,
      v_flower_id,
      v_inv_id,
      v_quantity,
      v_reason,
      COALESCE(v_item_comment, nullif(trim(p_comment), '')),
      p_writeoff_date,
      v_loss_amount
    )
    RETURNING id INTO v_writeoff_id;

    -- ── INSERT INTO stock_movements (append-only, never DELETE) ───────────
    -- variety_id / color_id берём из inventory_items (v_variety_id, v_color_id)
    INSERT INTO stock_movements (
      organization_id,
      inventory_item_id,
      flower_id,
      variety_id,
      color_id,
      quantity,
      movement_type,
      source_type,
      source_id,
      comment
    ) VALUES (
      v_org_id,
      v_inv_id,
      v_flower_id,
      v_variety_id,
      v_color_id,
      -v_quantity,
      'writeoff',
      'writeoff',
      v_writeoff_id,
      v_reason
    );

    v_writeoff_count := v_writeoff_count + 1;
  END LOOP;

  -- 5. Всё прошло — вернуть результат
  RETURN jsonb_build_object(
    'success',        true,
    'writeoff_count', v_writeoff_count,
    'movement_count', v_writeoff_count
  );

END;
$$;

-- ════════════════════════════════════════════════════════════
-- ПРАВА НА ВЫПОЛНЕНИЕ
-- Запретить всем через PUBLIC и anon, разрешить только authenticated.
-- ════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.create_writeoff_atomic(date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_writeoff_atomic(date, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_writeoff_atomic(date, text, jsonb) TO authenticated;
