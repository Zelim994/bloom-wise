-- ─────────────────────────────────────────────────────────────────────────
-- migration_003_catalog_schema.sql
-- Каталог товаров: flowers, flower_varieties, flower_colors, flower_images
--
-- Документирует таблицы, созданные вручную в Supabase Studio.
-- Идемпотентна: CREATE TABLE IF NOT EXISTS, DO-блоки для policies.
-- Зависит от: migration_001_init.sql (organizations, profiles, get_user_organization_id)
--
-- НЕ содержит flower_stock VIEW — она зависит от stock_movements (migration_004).
-- ─────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- ТАБЛИЦЫ
-- ════════════════════════════════════════════════════════════

-- Каталог позиций (цветы, зелень, упаковка, декор и т.д.)
CREATE TABLE IF NOT EXISTS flowers (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  category        text        NOT NULL DEFAULT 'Срезка',
  unit            text        NOT NULL DEFAULT 'шт',
  description     text,
  florist_comment text,
  min_stock       integer              DEFAULT 0,
  sale_price      numeric,
  is_active       boolean              DEFAULT true,
  created_at      timestamptz          DEFAULT now(),
  updated_at      timestamptz          DEFAULT now(),
  created_by      uuid                 REFERENCES profiles(id) ON DELETE NO ACTION
);

-- Сорта позиции каталога
CREATE TABLE IF NOT EXISTS flower_varieties (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flower_id  uuid        NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  size       text,
  notes      text,
  is_active  boolean              DEFAULT true,
  created_at timestamptz          DEFAULT now()
);

-- Цвета позиции (могут быть привязаны к сорту)
CREATE TABLE IF NOT EXISTS flower_colors (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flower_id  uuid        NOT NULL REFERENCES flowers(id)          ON DELETE CASCADE,
  variety_id uuid                 REFERENCES flower_varieties(id)  ON DELETE CASCADE,
  name       text        NOT NULL,
  hex_code   text,
  is_active  boolean              DEFAULT true,
  created_at timestamptz          DEFAULT now()
);

-- Фотографии позиции (могут быть привязаны к сорту или цвету)
CREATE TABLE IF NOT EXISTS flower_images (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flower_id  uuid        NOT NULL REFERENCES flowers(id)          ON DELETE CASCADE,
  variety_id uuid                 REFERENCES flower_varieties(id)  ON DELETE SET NULL,
  color_id   uuid                 REFERENCES flower_colors(id)     ON DELETE SET NULL,
  url        text        NOT NULL,
  is_primary boolean              DEFAULT false,
  sort_order integer              DEFAULT 0,
  created_at timestamptz          DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY идемпотентна в PostgreSQL
-- ════════════════════════════════════════════════════════════

ALTER TABLE flowers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE flower_varieties ENABLE ROW LEVEL SECURITY;
ALTER TABLE flower_colors    ENABLE ROW LEVEL SECURITY;
ALTER TABLE flower_images    ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════
-- RLS POLICIES — flowers
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flowers' AND policyname = 'flowers_select'
  ) THEN
    CREATE POLICY flowers_select ON flowers
      FOR SELECT USING (organization_id = get_user_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flowers' AND policyname = 'flowers_insert'
  ) THEN
    CREATE POLICY flowers_insert ON flowers
      FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flowers' AND policyname = 'flowers_update'
  ) THEN
    CREATE POLICY flowers_update ON flowers
      FOR UPDATE
      USING     (organization_id = get_user_organization_id())
      WITH CHECK (organization_id = get_user_organization_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flowers' AND policyname = 'flowers_delete'
  ) THEN
    CREATE POLICY flowers_delete ON flowers
      FOR DELETE USING (organization_id = get_user_organization_id());
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- RLS POLICIES — flower_varieties
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_varieties' AND policyname = 'flower_varieties_select'
  ) THEN
    CREATE POLICY flower_varieties_select ON flower_varieties
      FOR SELECT USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_varieties' AND policyname = 'flower_varieties_insert'
  ) THEN
    CREATE POLICY flower_varieties_insert ON flower_varieties
      FOR INSERT WITH CHECK (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_varieties' AND policyname = 'flower_varieties_update'
  ) THEN
    CREATE POLICY flower_varieties_update ON flower_varieties
      FOR UPDATE
      USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      )
      WITH CHECK (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_varieties' AND policyname = 'flower_varieties_delete'
  ) THEN
    CREATE POLICY flower_varieties_delete ON flower_varieties
      FOR DELETE USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- RLS POLICIES — flower_colors
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_colors' AND policyname = 'flower_colors_select'
  ) THEN
    CREATE POLICY flower_colors_select ON flower_colors
      FOR SELECT USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_colors' AND policyname = 'flower_colors_insert'
  ) THEN
    CREATE POLICY flower_colors_insert ON flower_colors
      FOR INSERT WITH CHECK (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_colors' AND policyname = 'flower_colors_update'
  ) THEN
    CREATE POLICY flower_colors_update ON flower_colors
      FOR UPDATE
      USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      )
      WITH CHECK (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_colors' AND policyname = 'flower_colors_delete'
  ) THEN
    CREATE POLICY flower_colors_delete ON flower_colors
      FOR DELETE USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- RLS POLICIES — flower_images
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_images' AND policyname = 'flower_images_select'
  ) THEN
    CREATE POLICY flower_images_select ON flower_images
      FOR SELECT USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_images' AND policyname = 'flower_images_insert'
  ) THEN
    CREATE POLICY flower_images_insert ON flower_images
      FOR INSERT WITH CHECK (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_images' AND policyname = 'flower_images_update'
  ) THEN
    CREATE POLICY flower_images_update ON flower_images
      FOR UPDATE
      USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      )
      WITH CHECK (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'flower_images' AND policyname = 'flower_images_delete'
  ) THEN
    CREATE POLICY flower_images_delete ON flower_images
      FOR DELETE USING (
        flower_id IN (SELECT id FROM flowers WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;
