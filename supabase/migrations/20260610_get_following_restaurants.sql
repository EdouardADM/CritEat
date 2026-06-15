-- Fonction RPC : get_following_restaurants
-- Renvoie les restaurants notés par les personnes que l'utilisateur suit
-- (filtre « Amis » de la carte), avec lat/lng extraits de la colonne geography.
-- Même pattern que get_user_reviewed_restaurants, joint via la table follows.
-- À exécuter dans Supabase SQL Editor.

create or replace function get_following_restaurants(p_user_id uuid)
returns table(
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
language sql
stable
security definer
set search_path = public, extensions
as $$
  select distinct
    r.id,
    r.place_id,
    r.name,
    r.category::text,
    r.address,
    r.city,
    r.composite_score,
    r.popularity_score,
    r.review_count,
    ST_Y(r.location::extensions.geometry) as lat,
    ST_X(r.location::extensions.geometry) as lng
  from restaurants r
  join reviews rv on rv.restaurant_id = r.id
  join follows  f on f.following_id = rv.user_id
  where f.follower_id = p_user_id;
$$;

grant execute on function get_following_restaurants(uuid) to authenticated, anon;
