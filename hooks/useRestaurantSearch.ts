import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export type SearchResult = {
  id: string;
  place_id: string;
  name: string;
  address: string;
  city: string;
  category: string;
  composite_score: number | null;
  popularity_score: number;
  review_count: number;
  lat: number;
  lng: number;
};

type UserLocation = { latitude: number; longitude: number };

export function useRestaurantSearch(
  query: string,
  userLocation: UserLocation | null,
) {
  const [localResults, setLocalResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Position lue via une ref : on utilise la dernière connue au moment de la
  // recherche, sans relancer le fetch à chaque mise à jour GPS (toutes les ~5 s).
  const locationRef = useRef(userLocation);
  locationRef.current = userLocation;

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setLocalResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const loc = locationRef.current;
        const { data, error } = await supabase
          .rpc("search_restaurants", {
            search_query: trimmed,
            user_lat: loc?.latitude ?? undefined,
            user_lng: loc?.longitude ?? undefined,
          });

        if (error) {
          console.error("[useRestaurantSearch] RPC error:", error.message);
          setLocalResults([]);
        } else {
          setLocalResults((data as SearchResult[]) ?? []);
        }
      } catch (e) {
        console.error("[useRestaurantSearch] Exception:", e);
        setLocalResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return { localResults, isLoading };
}
