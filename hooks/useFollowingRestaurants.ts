import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Restaurant } from "./useRestaurants";

// Restaurants notés par les personnes que l'utilisateur courant suit (filtre
// « Amis » de la carte), via le RPC dédié. Ne charge que si `enabled` est vrai.
// Réutilise le type `Restaurant` pour rester compatible avec restaurantsToGeoJSON.
export function useFollowingRestaurants(enabled: boolean): {
  restaurants: Restaurant[];
  loading: boolean;
} {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setRestaurants([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setRestaurants([]);
          return;
        }

        const { data, error } = await supabase.rpc("get_following_restaurants", {
          p_user_id: user.id,
        });
        if (error) throw error;

        const mapped: Restaurant[] = (data ?? []).map((r: any) => ({
          id: r.id,
          place_id: r.place_id,
          name: r.name,
          category: r.category,
          address: r.address,
          city: r.city,
          latitude: r.lat,
          longitude: r.lng,
          composite_score: r.composite_score,
          popularity_score: r.popularity_score,
          review_count: r.review_count,
        }));

        if (!cancelled) setRestaurants(mapped);
      } catch (e) {
        // Surfacer l'erreur : une erreur silencieuse ressemble à « aucun résultat ».
        console.error("[useFollowingRestaurants] échec RPC :", e);
        if (!cancelled) setRestaurants([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);

  return { restaurants, loading };
}
