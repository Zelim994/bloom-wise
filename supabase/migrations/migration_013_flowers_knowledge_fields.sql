-- ─────────────────────────────────────────────────────────────────────────────
-- migration_013_flowers_knowledge_fields.sql
--
-- Добавляет поля базы знаний флориста в таблицу flowers.
--
-- Новые поля:
--   vase_life_min_days  — нижняя граница стойкости (дней в вазе)
--   vase_life_max_days  — верхняя граница стойкости (дней в вазе)
--   seasonality         — сезоны: весна / лето / осень / зима / круглый год
--   styles              — характер/стиль: классика / нежная / яркая / минимализм / акцент
--   usage_tags          — применение в букете: моно / сборные / наполнитель / объём / линии
--   property_tags       — свойства: стойкая / аромат / сухоцвет / ягоды / зелень
--   care_notes          — заметки по уходу и хранению
--   buying_notes        — заметки по закупке (когда, что спрашивать у поставщика)
--   combination_notes   — с чем сочетается
--
-- Безопасность:
--   ADD COLUMN IF NOT EXISTS — идемпотентна, можно применять повторно.
--   Все колонки добавляются с дефолтами — существующие строки не затрагиваются.
--   text[] NOT NULL DEFAULT '{}' — пустой массив вместо NULL, удобнее для UI.
--   Не меняет RLS, политики, RPC, склад, движения или другие таблицы.
--
-- Зависит от: migration_012_flower_variant_stock_view.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.flowers
  ADD COLUMN IF NOT EXISTS vase_life_min_days  integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vase_life_max_days  integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS seasonality         text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS styles              text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usage_tags          text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS property_tags       text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS care_notes          text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS buying_notes        text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS combination_notes   text     DEFAULT NULL;
