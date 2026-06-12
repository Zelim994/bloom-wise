-- ─────────────────────────────────────────────────────────────────────────
-- migration_005_flower_stock_view.sql
-- VIEW: flower_stock
--
-- Документирует вьюху, созданную вручную в Supabase Studio.
-- Зависит от:
--   migration_003_catalog_schema.sql  (flowers)
--   migration_004_inventory_schema.sql (stock_movements)
--
-- Использует security_invoker = true:
--   вьюха выполняется от имени вызывающего пользователя,
--   поэтому RLS из stock_movements применяется автоматически.
--   Явные RLS policies на саму вьюху не нужны.
--
-- CREATE OR REPLACE VIEW безопасна: пересоздаёт вьюху если она уже есть,
-- при условии что список колонок не меняется.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW flower_stock
  WITH (security_invoker = true)
AS
SELECT
  flower_id,
  (COALESCE(sum(quantity), (0)::bigint))::integer AS current_stock
FROM stock_movements
GROUP BY flower_id;
