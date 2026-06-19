-- ─────────────────────────────────────────────────────────────────────────────
-- migration_012_flower_variant_stock_view.sql
--
-- Создаёт read-only view flower_variant_stock.
-- Показывает остатки по связке: organization_id + flower_id + variety_id + color_id.
--
-- Считает через inventory_items.quantity_remaining, потому что:
--   - variety_id и color_id уже есть в inventory_items (с migration_004);
--   - quantity_remaining транзакционно обновляется RPC create_purchase_atomic;
--   - stock_movements не содержит variety_id напрямую.
--
-- Старый flower_stock НЕ меняется.
-- Не меняет таблицы, RLS, политики, существующие данные.
-- Идемпотентна: CREATE OR REPLACE VIEW.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.flower_variant_stock
WITH (security_invoker = true)
AS
SELECT
  ii.organization_id,
  ii.flower_id,
  ii.variety_id,
  ii.color_id,
  f.name        AS flower_name,
  f.unit        AS flower_unit,
  f.category    AS flower_category,
  fv.name       AS variety_name,
  fv.size       AS variety_size,
  fc.name       AS color_name,
  SUM(ii.quantity_remaining)::integer AS current_stock
FROM public.inventory_items ii
JOIN public.flowers f
  ON f.id = ii.flower_id
LEFT JOIN public.flower_varieties fv
  ON fv.id = ii.variety_id
LEFT JOIN public.flower_colors fc
  ON fc.id = ii.color_id
WHERE ii.quantity_remaining > 0
GROUP BY
  ii.organization_id,
  ii.flower_id,
  ii.variety_id,
  ii.color_id,
  f.name,
  f.unit,
  f.category,
  fv.name,
  fv.size,
  fc.name;
