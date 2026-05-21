-- Migration : trace la distance restaurant au moment de la publication
-- À exécuter dans le SQL Editor Supabase (Dashboard > SQL Editor)

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS published_from_distance_m double precision,
  ADD COLUMN IF NOT EXISTS published_from_accuracy_m double precision;

COMMENT ON COLUMN reviews.published_from_distance_m IS
  'Distance en mètres entre la position GPS de l''utilisateur et le restaurant au moment du gate de distance. NULL si non vérifié (cas legacy).';
COMMENT ON COLUMN reviews.published_from_accuracy_m IS
  'Précision GPS rapportée par le device au moment du gate de distance.';
