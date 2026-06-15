-- Fonction RPC : get_user_reviewed_restaurants
-- Renvoie les restaurants notés par un utilisateur, avec lat/lng extraits de la
-- colonne geography (même pattern que get_restaurant_detail / get_restaurants_in_bounds).
-- Utilisé par la carte du profil (affiche uniquement les restos notés par l'utilisateur).
-- À exécuter dans Supabase SQL Editor.

CREATE OR REPLACE FUNCTION get_user_reviewed_restaurants(p_user_id uuid)
RETURNS TABLE(
  id               uuid,
  place_id         text,
  name             text,
  category         text,
  address          text,
  city             text,
  composite_score  double precision,
  popularity_score double precision,
  review_count     integer,
  lat              double precision,
  lng              double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT DISTINCT
    r.id,
    r.place_id,
    r.name,
    r.category::text,
    r.address,
    r.city,
    r.composite_score,
    r.popularity_score,
    r.review_count,
    ST_Y(r.location::extensions.geometry) AS lat,
    ST_X(r.location::extensions.geometry) AS lng
  FROM restaurants r
  JOIN reviews rv ON rv.restaurant_id = r.id
  WHERE rv.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_user_reviewed_restaurants(uuid) TO authenticated, anon;
