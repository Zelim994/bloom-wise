-- migration_017: add prompt and image_path to ai_requests
-- Extends ai_requests to support AI bouquet image generation history.
-- prompt     — full text sent to OpenAI (for display and search)
-- image_path — path in Supabase Storage bucket (permanent, replaces temporary OpenAI URL)

alter table ai_requests
  add column if not exists prompt     text null,
  add column if not exists image_path text null;
