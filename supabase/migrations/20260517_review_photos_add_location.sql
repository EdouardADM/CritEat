-- Migration : ajout de la position GPS de la prise de photo sur review_photos
-- À exécuter dans le SQL Editor Supabase (Dashboard > SQL Editor)
-- ou via : supabase db push

ALTER TABLE review_photos
  ADD COLUMN IF NOT EXISTS captured_at_location   geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS captured_at_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS captured_at_timestamp  timestamptz;

-- Index spatial pour les futures requêtes de distance (détection avis suspects)
CREATE INDEX IF NOT EXISTS idx_review_photos_captured_location
  ON review_photos USING GIST (captured_at_location);

COMMENT ON COLUMN review_photos.captured_at_location IS
  'Position GPS du device au moment du pick de la photo. NULL si permission refusée.';
COMMENT ON COLUMN review_photos.captured_at_accuracy_m IS
  'Précision GPS en mètres rapportée par le device.';
COMMENT ON COLUMN review_photos.captured_at_timestamp IS
  'Timestamp de la lecture GPS (pas du commit BDD).';
