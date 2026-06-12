-- ─────────────────────────────────────────────────────────────────────────
-- migration_006_add_flower_sku.sql
-- Человеческий код товара (артикул) для таблицы flowers
--
-- Что делает:
--   1. Добавляет колонку sku text (nullable — NOT NULL не добавляем сейчас).
--   2. Заполняет sku для существующих товаров в формате FLW-000001, FLW-000002, ...
--      Нумерация ведётся внутри каждой организации (PARTITION BY organization_id).
--      Порядок детерминированный: ORDER BY created_at, id.
--   3. Создаёт уникальный индекс organization_id + sku (WHERE sku IS NOT NULL).
--
-- Идемпотентна:
--   ADD COLUMN IF NOT EXISTS — безопасен при повторном запуске.
--   UPDATE затрагивает только строки где sku IS NULL — не перезаписывает вручную проставленные.
--   CREATE UNIQUE INDEX IF NOT EXISTS — не падает если индекс уже есть.
--
-- Зависит от: migration_003_catalog_schema.sql (flowers, organization_id)
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Добавить колонку
ALTER TABLE flowers ADD COLUMN IF NOT EXISTS sku text;

-- 2. Backfill: заполнить sku для уже существующих товаров
UPDATE flowers f
SET sku = sub.generated_sku
FROM (
  SELECT
    id,
    'FLW-' || LPAD(
      ROW_NUMBER() OVER (
        PARTITION BY organization_id
        ORDER BY created_at, id
      )::text,
      6, '0'
    ) AS generated_sku
  FROM flowers
  WHERE sku IS NULL
) sub
WHERE f.id = sub.id;

-- 3. Уникальный индекс: organization_id + sku
-- WHERE sku IS NOT NULL — не блокирует строки без артикула
CREATE UNIQUE INDEX IF NOT EXISTS flowers_org_sku_unique
  ON flowers (organization_id, sku)
  WHERE sku IS NOT NULL;
