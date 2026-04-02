-- ═══════════════════════════════════════════════════════════════════
-- Fonction RPC : get_restaurants_in_bounds
-- À exécuter dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Index spatial (si absent) — CRITIQUE pour les performances
CREATE INDEX IF NOT EXISTS restaurants_location_gist_idx
  ON restaurants USING GIST (location);

-- 2. Fonction RPC
CREATE OR REPLACE FUNCTION get_restaurants_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
RETURNS TABLE(
  id             uuid,
  place_id       text,
  name           text,
  category       text,
  address        text,
  city           text,
  latitude       double precision,
  longitude      double precision,
  composite_score double precision,
  review_count   integer
)
LANGUAGE sql
STABLE          -- résultat déterministe pour les mêmes params dans une transaction
SECURITY DEFINER
-- Inclure extensions dans le search_path pour que les types PostGIS
-- (geometry, geography) soient visibles — Supabase les installe dans ce schéma
SET search_path = public, extensions
AS $$
  SELECT
    r.id,
    r.place_id,
    r.name,
    r.category::text,
    r.address,
    r.city,
    -- ST_Y = latitude, ST_X = longitude (cast geography → geometry requis)
    ST_Y(r.location::extensions.geometry)           AS latitude,
    ST_X(r.location::extensions.geometry)           AS longitude,
    r.composite_score,
    r.review_count
  FROM restaurants r
  WHERE
    -- && utilise l'index GIST, bien plus rapide que ST_Within
    r.location::extensions.geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  ORDER BY r.composite_score DESC NULLS LAST
  LIMIT 200;
$$;

-- 3. Exposer la fonction aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION get_restaurants_in_bounds(
  double precision, double precision, double precision, double precision
) TO authenticated;
