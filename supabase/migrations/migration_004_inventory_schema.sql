-- ─────────────────────────────────────────────────────────────────────────
-- migration_004_inventory_schema.sql
-- Склад: inventory_items, stock_movements
--
-- Документирует таблицы, созданные вручную в Supabase Studio.
-- Идемпотентна: CREATE TABLE IF NOT EXISTS, DO-блоки для policies.
-- Зависит от: migration_001_init.sql (organizations, branches, profiles, suppliers)
--             migration_003_catalog_schema.sql (flowers, flower_varieties, flower_colors)
--
-- НЕ содержит flower_stock VIEW — она описана в migration_005.
-- stock_movements намеренно не имеет DELETE/UPDATE policies (append-only лог).
-- ─────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- ТАБЛИЦЫ
-- ════════════════════════════════════════════════════════════

-- Партии товара на складе (каждый приход = одна запись)
CREATE TABLE IF NOT EXISTS inventory_items (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES organizations(id)    ON DELETE CASCADE,
  branch_id         uuid                 REFERENCES branches(id)         ON DELETE NO ACTION,
  flower_id         uuid        NOT NULL REFERENCES flowers(id)          ON DELETE NO ACTION,
  variety_id        uuid                 REFERENCES flower_varieties(id)  ON DELETE NO ACTION,
  color_id          uuid                 REFERENCES flower_colors(id)     ON DELETE NO ACTION,
  supplier_id       uuid                 REFERENCES suppliers(id)         ON DELETE NO ACTION,
  arrived_at        date        NOT NULL DEFAULT CURRENT_DATE,
  cost_price        numeric     NOT NULL,
  sale_price        numeric,
  quantity_in       integer     NOT NULL,
  quantity_remaining integer    NOT NULL,
  expires_at        date,
  freshness_status  text                 DEFAULT 'fresh',
  comment           text,
  purchase_id       uuid,
  created_at        timestamptz          DEFAULT now(),
  updated_at        timestamptz          DEFAULT now(),
  created_by        uuid                 REFERENCES profiles(id)          ON DELETE NO ACTION
);

-- Движения склада (append-only лог: приход, продажа, списание и т.д.)
CREATE TABLE IF NOT EXISTS stock_movements (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES organizations(id)    ON DELETE CASCADE,
  branch_id         uuid                 REFERENCES branches(id)         ON DELETE NO ACTION,
  inventory_item_id uuid        NOT NULL REFERENCES inventory_items(id)  ON DELETE NO ACTION,
  flower_id         uuid        NOT NULL REFERENCES flowers(id)          ON DELETE NO ACTION,
  quantity          integer     NOT NULL,
  movement_type     text        NOT NULL,
  source_type       text,
  source_id         uuid,
  comment           text,
  created_at        timestamptz          DEFAULT now(),
  created_by        uuid                 REFERENCES profiles(id)          ON DELETE NO ACTION
);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY идемпотентна в PostgreSQL
-- ════════════════════════════════════════════════════════════

ALTER TABLE inventory_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements  ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════
-- RLS POLICIES — inventory_items
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'inventory_items_select'
  ) THEN
    CREATE POLICY inventory_items_select ON inventory_items
      FOR SELECT USING (organization_id = get_user_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'inventory_items_insert'
  ) THEN
    CREATE POLICY inventory_items_insert ON inventory_items
      FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'inventory_items_update'
  ) THEN
    CREATE POLICY inventory_items_update ON inventory_items
      FOR UPDATE
      USING     (organization_id = get_user_organization_id())
      WITH CHECK (organization_id = get_user_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'inventory_items_delete'
  ) THEN
    CREATE POLICY inventory_items_delete ON inventory_items
      FOR DELETE USING (organization_id = get_user_organization_id());
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- RLS POLICIES — stock_movements
-- Только SELECT и INSERT — намеренно, лог движений append-only.
-- DELETE и UPDATE policies отсутствуют в live DB и не добавляются здесь.
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_movements' AND policyname = 'stock_movements_select'
  ) THEN
    CREATE POLICY stock_movements_select ON stock_movements
      FOR SELECT USING (organization_id = get_user_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_movements' AND policyname = 'stock_movements_insert'
  ) THEN
    CREATE POLICY stock_movements_insert ON stock_movements
      FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
  END IF;
END $$;
