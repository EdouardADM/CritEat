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
  _userLocation: UserLocation | null,
) {
  const [localResults, setLocalResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const { data, error } = await supabase
          .rpc("search_restaurants", { search_query: trimmed });

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
