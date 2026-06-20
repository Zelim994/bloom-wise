-- migration_014: add variety_id and color_id to bouquet_items
--
-- Цель: связать позицию букета с конкретным вариантом (сорт/размер) и цветом.
-- Поля nullable — старые записи остаются валидными (variety_id/color_id = null).
-- Совместимость: код, RPC и бизнес-логика не меняются этой миграцией.

alter table public.bouquet_items
  add column if not exists variety_id uuid
    references public.flower_varieties(id),
  add column if not exists color_id uuid
    references public.flower_colors(id);

-- Индекс по variety_id
create index if not exists idx_bouquet_items_variety_id
  on public.bouquet_items(variety_id);

-- Индекс по color_id
create index if not exists idx_bouquet_items_color_id
  on public.bouquet_items(color_id);

-- Индекс по flower_id (отсутствовал — нужен для FIFO-списания и JOIN с inventory_items)
create index if not exists idx_bouquet_items_flower_id
  on public.bouquet_items(flower_id);
