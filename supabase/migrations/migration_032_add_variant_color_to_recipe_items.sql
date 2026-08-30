-- migration_032: add variety_id and color_id to recipe_items
--
-- recipe_items currently stores only flower_id, so a recipe composed from a
-- specific variety/color (e.g. "Rose Mondial · 80cm · red") loses that choice
-- on save — RecipeForm drops variety_id/color_id before calling upsertRecipe,
-- and the columns don't exist to receive them even if it didn't (confirmed in
-- RECIPES-VARIETY-GAP-A). This mirrors migration_014's fix for the same gap
-- on bouquet_items: nullable FK columns, no backfill, no app/RLS change.
--
-- Production at the time of this migration (confirmed via read-only checks):
--   total_recipes = 0, total_recipe_items = 0 — no historical data to convert.
--
-- Explicitly out of scope: RLS/policies/grants (new columns stay inside the
-- existing recipe_id → recipes.organization_id tenant boundary), indexes (no
-- query pattern yet justifies one — recipe_items has no production rows),
-- a CHECK tying variety_id/color_id to flower_id (bouquet_items, the accepted
-- precedent, has none either), application code, generated types.

begin;

alter table public.recipe_items
  add column variety_id uuid;

alter table public.recipe_items
  add column color_id uuid;

alter table public.recipe_items
  add constraint recipe_items_variety_id_fkey
  foreign key (variety_id)
  references public.flower_varieties(id);

alter table public.recipe_items
  add constraint recipe_items_color_id_fkey
  foreign key (color_id)
  references public.flower_colors(id);

commit;
