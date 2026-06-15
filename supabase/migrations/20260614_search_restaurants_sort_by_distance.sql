-- Ajuste le tri de search_restaurants : la DISTANCE devient le critère n°1
-- (le plus proche d'abord), la pertinence textuelle ne sert plus qu'à départager.
-- Suit la migration 20260614_search_restaurants_fuzzy.sql (déjà appliquée).
-- Même signature qu'avant → simple CREATE OR REPLACE, pas de DROP nécessaire.
-- À exécuter dans l'éditeur SQL Supabase.

CREATE OR REPLACE FUNCTION public.search_restaurants(
  search_query text,
  user_lat     double precision DEFAULT NULL,
  user_lng     double precision DEFAULT NULL
)
RETURNS TABLE(
  id uuid, place_id text, name text, address text, city text, category text,
  composite_score double precision, popularity_score double precision,
  review_count integer, lat double precision, lng double precision
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $function$
  WITH q AS (
    SELECT
      unaccent(lower(btrim(search_query))) AS nq,
      -- point de l'utilisateur (geography) si la position est connue, sinon NULL
      CASE
        WHEN user_lat IS NULL OR user_lng IS NULL THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
      END AS upt
  )
  SELECT
    r.id, r.place_id, r.name, r.address, r.city, r.category::text,
    r.composite_score, r.popularity_score, r.review_count,
    ST_Y(r.location::geometry) AS lat,
    ST_X(r.location::geometry) AS lng
  FROM restaurants r, q
  WHERE
    -- correspondance directe (sous-chaîne), insensible aux accents
    unaccent(lower(r.name)) ILIKE '%' || q.nq || '%'
    OR unaccent(lower(r.city)) ILIKE '%' || q.nq || '%'
    -- tolérance aux fautes : similarité trigramme sur le nom
    OR similarity(unaccent(lower(r.name)), q.nq) > 0.25
  ORDER BY
    -- 1) DISTANCE : le plus proche d'abord. NULL si position inconnue → départage
    --    alors par la pertinence textuelle puis la popularité (NULLS LAST).
    CASE WHEN q.upt IS NULL THEN NULL ELSE ST_Distance(r.location, q.upt) END
      ASC NULLS LAST,
    (unaccent(lower(r.name)) ILIKE q.nq || '%') DESC,        -- 2) préfixe exact
    similarity(unaccent(lower(r.name)), q.nq) DESC,           -- 3) proximité textuelle
    r.popularity_score DESC NULLS LAST                        -- 4) popularité
  LIMIT 15;
$function$;

GRANT EXECUTE ON FUNCTION public.search_restaurants(text, double precision, double precision)
  TO authenticated, anon;
