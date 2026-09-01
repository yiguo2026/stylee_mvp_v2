-- Give independently processed batch-import items a durable idempotency key.
-- PostgreSQL UNIQUE permits multiple NULL import_key values, so ordinary
-- manual/photo rows retain their existing insert behavior.
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS import_key TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wardrobe_items_user_id_import_key_key'
      AND conrelid = 'public.wardrobe_items'::regclass
  ) THEN
    ALTER TABLE public.wardrobe_items
      ADD CONSTRAINT wardrobe_items_user_id_import_key_key
      UNIQUE (user_id, import_key);
  END IF;
END
$$;

COMMENT ON COLUMN public.wardrobe_items.import_key IS
  'Stable per-garment key used to make asynchronous batch imports idempotent.';
