import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Restaurant } from "./useRestaurants";

// Restaurants notés par un utilisateur, avec coordonnées (via RPC dédié).
// Réutilise le type `Restaurant` pour rester compatible avec restaurantsToGeoJSON.
export function useUserReviewedRestaurants(userId: string): {
  restaurants: Restaurant[];
  loading: boolean;
  error: string | null;
} {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          "get_user_reviewed_restaurants",
          { p_user_id: userId },
        );
        if (rpcError) throw rpcError;

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
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  return { restaurants, loading, error };
}

// Bbox [west, south, east, north] englobant les restaurants, avec une marge
// minimale (utile quand il n'y a qu'un seul point).
export function boundsOf(
  restaurants: Restaurant[],
  minSpan = 0.01,
): [number, number, number, number] | null {
  if (restaurants.length === 0) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const r of restaurants) {
    minLat = Math.min(minLat, r.latitude);
    maxLat = Math.max(maxLat, r.latitude);
    minLng = Math.min(minLng, r.longitude);
    maxLng = Math.max(maxLng, r.longitude);
  }
  // Élargit si la zone est trop petite (un seul resto, ou restos très proches).
  if (maxLat - minLat < minSpan) {
    const c = (maxLat + minLat) / 2;
    minLat = c - minSpan / 2;
    maxLat = c + minSpan / 2;
  }
  if (maxLng - minLng < minSpan) {
    const c = (maxLng + minLng) / 2;
    minLng = c - minSpan / 2;
    maxLng = c + minSpan / 2;
  }
  return [minLng, minLat, maxLng, maxLat];
}
