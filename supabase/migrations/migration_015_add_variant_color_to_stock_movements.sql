-- migration_015_add_variant_color_to_stock_movements.sql
--
-- Добавляет variety_id и color_id в stock_movements.
-- Поля nullable — все существующие движения остаются валидными.
-- Не меняет RPC, RLS, inventory_items, код приложения.
-- Применять только к dev DB до обновления кода.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.stock_movements
  add column if not exists variety_id uuid null references public.flower_varieties(id),
  add column if not exists color_id   uuid null references public.flower_colors(id);

create index if not exists idx_stock_movements_variety_id
  on public.stock_movements(variety_id);

create index if not exists idx_stock_movements_color_id
  on public.stock_movements(color_id);
