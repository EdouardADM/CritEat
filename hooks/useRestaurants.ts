import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { restaurantsToGeoJSON, type RestaurantFeatureCollection } from "../utils/geo";

export type Restaurant = {
  id: string;
  place_id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  composite_score: number | null;
  popularity_score: number | null;
  review_count: number;
};

export type MapBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
};

type CacheBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

/** Vrai si newBounds est entièrement contenu dans cachedBounds */
function isContained(newBounds: CacheBounds, cachedBounds: CacheBounds): boolean {
  return (
    newBounds.minLat >= cachedBounds.minLat &&
    newBounds.maxLat <= cachedBounds.maxLat &&
    newBounds.minLng >= cachedBounds.minLng &&
    newBounds.maxLng <= cachedBounds.maxLng
  );
}

/** Filtre le cache aux restaurants visibles dans les bounds données */
function filterByBounds(cache: Map<string, Restaurant>, bounds: CacheBounds): Restaurant[] {
  const result: Restaurant[] = [];
  for (const r of cache.values()) {
    if (
      r.latitude >= bounds.minLat && r.latitude <= bounds.maxLat &&
      r.longitude >= bounds.minLng && r.longitude <= bounds.maxLng
    ) {
      result.push(r);
    }
  }
  return result;
}

export function useRestaurants(bounds: MapBounds | null): {
  restaurants: Restaurant[];
  restaurantsGeoJSON: RestaurantFeatureCollection;
  loading: boolean;
  error: string | null;
} {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache global : place_id → restaurant
  const cache = useRef<Map<string, Restaurant>>(new Map());
  // Bounds et zoom du dernier fetch (pour la logique de cache)
  const lastFetchedBounds = useRef<CacheBounds | null>(null);
  const lastFetchedZoom = useRef<number | null>(null);
  // Timer du debounce
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchForBounds = useCallback(async (b: MapBounds) => {
    const cacheBounds: CacheBounds = {
      minLat: b.minLat,
      minLng: b.minLng,
      maxLat: b.maxLat,
      maxLng: b.maxLng,
    };

    // Un changement de zoom significatif (> 1 niveau) invalide le cache
    const zoomDiff = lastFetchedZoom.current !== null
      ? Math.abs(b.zoom - lastFetchedZoom.current)
      : Infinity;
    if (zoomDiff > 1) {
      cache.current.clear();
      lastFetchedBounds.current = null;
    }

    // Bounds dans le cache → pas de requête réseau
    if (lastFetchedBounds.current && isContained(cacheBounds, lastFetchedBounds.current)) {
      setRestaurants(filterByBounds(cache.current, cacheBounds));
      return;
    }

    // Élargit la zone de 80 % pour absorber les pans sans re-requête
    const latPad = (b.maxLat - b.minLat) * 0.8;
    const lngPad = (b.maxLng - b.minLng) * 0.8;
    const fetchBounds: CacheBounds = {
      minLat: b.minLat - latPad,
      maxLat: b.maxLat + latPad,
      minLng: b.minLng - lngPad,
      maxLng: b.maxLng + lngPad,
    };

    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_restaurants_in_bounds",
        {
          min_lat: fetchBounds.minLat,
          min_lng: fetchBounds.minLng,
          max_lat: fetchBounds.maxLat,
          max_lng: fetchBounds.maxLng,
          zoom_level: b.zoom,
        }
      );

      if (rpcError) throw rpcError;

      for (const row of data ?? []) {
        cache.current.set(row.place_id, row as Restaurant);
      }

      lastFetchedBounds.current = fetchBounds;
      lastFetchedZoom.current = b.zoom;

      setRestaurants(filterByBounds(cache.current, cacheBounds));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!bounds) return;

    // zoom < 10 ≈ vue nationale/continentale → rien à afficher, pas de fetch
    if (bounds.zoom < 10) {
      setRestaurants([]);
      return;
    }

    // Debounce 150ms : MapLibre's onRegionDidChange se déclenche déjà une seule
    // fois par geste terminé (pas en continu), donc 150ms suffisent pour couvrir
    // les animations et éviter les doubles appels sans ajouter de latence perceptible.
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchForBounds(bounds);
    }, 150);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [bounds, fetchForBounds]);

  const restaurantsGeoJSON = useMemo(
    () => restaurantsToGeoJSON(restaurants),
    [restaurants]
  );

  return { restaurants, restaurantsGeoJSON, loading, error };
}
