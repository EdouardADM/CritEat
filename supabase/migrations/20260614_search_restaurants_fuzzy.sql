-- Recherche de restaurants tolérante aux fautes de frappe + insensible aux accents,
-- triée par pertinence puis par DISTANCE (le plus proche d'abord).
-- Remplace l'ancienne version (simple `name ILIKE '%query%'`, sans tolérance ni distance).
-- Combine : correspondance sous-chaîne (nom + ville) + similarité trigramme (pg_trgm)
-- + insensibilité aux accents (unaccent) + tri par distance si la position est fournie.
-- pg_trgm et unaccent sont déjà activées.
-- search_path fixé à public, extensions → résout unaccent/similarity/postgis
-- quel que soit le schéma d'installation des extensions.
-- À exécuter dans l'éditeur SQL Supabase.

-- L'ancienne signature à 1 argument est supprimée pour éviter une ambiguïté
-- d'overload avec la nouvelle (qui a des paramètres par défaut).
DROP FUNCTION IF EXISTS public.search_restaurants(text);

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
    (unaccent(lower(r.name)) ILIKE q.nq || '%') DESC,        -- 1) préfixe exact d'abord
    similarity(unaccent(lower(r.name)), q.nq) DESC,           -- 2) proximité textuelle (fautes)
    -- 3) distance : le plus proche d'abord (homonymes départagés ici).
    --    NULL si la position est inconnue → départage par popularité.
    CASE WHEN q.upt IS NULL THEN NULL ELSE ST_Distance(r.location, q.upt) END
      ASC NULLS LAST,
    r.popularity_score DESC NULLS LAST                        -- 4) popularité (fallback)
  LIMIT 15;
$function$;

GRANT EXECUTE ON FUNCTION public.search_restaurants(text, double precision, double precision)
  TO authenticated, anon;
