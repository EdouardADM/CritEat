-- Fonction RPC : get_restaurant_detail
-- Remplace le select direct sur restaurants pour inclure lat/lng
-- depuis la colonne geography (même pattern que get_restaurants_in_bounds)
-- À exécuter dans Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_restaurant_detail(p_id uuid)
RETURNS TABLE(
  id               uuid,
  name             text,
  category         text,
  address          text,
  city             text,
  postcode         text,
  phone            text,
  website          text,
  opening_hours    jsonb,
  description      text,
  composite_score  double precision,
  score_qp         double precision,
  score_ambiance   double precision,
  score_service    double precision,
  score_food       double precision,
  review_count     integer,
  takeaway         boolean,
  delivery         boolean,
  outdoor_seating  boolean,
  wheelchair       boolean,
  diet_options     jsonb,
  price_range      smallint,
  lat              double precision,
  lng              double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    r.id,
    r.name,
    r.category::text,
    r.address,
    r.city,
    r.postcode,
    r.phone,
    r.website,
    r.opening_hours,
    r.description,
    r.composite_score,
    r.score_qp,
    r.score_ambiance,
    r.score_service,
    r.score_food,
    r.review_count,
    r.takeaway,
    r.delivery,
    r.outdoor_seating,
    r.wheelchair,
    r.diet_options,
    r.price_range,
    ST_Y(r.location::extensions.geometry) AS lat,
    ST_X(r.location::extensions.geometry) AS lng
  FROM restaurants r
  WHERE r.id = p_id;
$$;

GRANT EXECUTE ON FUNCTION get_restaurant_detail(uuid) TO authenticated, anon;
