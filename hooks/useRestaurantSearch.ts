import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { searchGooglePlaces, type GooglePlace } from "../lib/google-places";
import { mapGoogleTypesToCategory } from "../utils/category-mapping";
import type { Restaurant } from "./useRestaurants";

// SearchResult = Restaurant (même shape retournée par la RPC search_restaurants)
export type SearchResult = Restaurant;

export type MappedGoogleResult = {
  place_id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  postcode: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  opening_hours: { weekdays: string[] } | null;
  source: "google";
};

// ─── Helpers d'extraction Google ─────────────────────────────────────────────

function extractCity(components?: GooglePlace["addressComponents"]): string {
  if (!components) return "Bruxelles";
  for (const type of ["locality", "sublocality", "administrative_area_level_2"]) {
    const c = components.find((comp) => comp.types.includes(type));
    if (c) return c.longText;
  }
  return "Bruxelles";
}

function extractPostcode(components?: GooglePlace["addressComponents"]): string | null {
  return (
    components?.find((c) => c.types.includes("postal_code"))?.longText ?? null
  );
}

function mapGooglePlace(place: GooglePlace): MappedGoogleResult {
  return {
    place_id: `google_${place.id}`,
    name: place.displayName.text,
    category: mapGoogleTypesToCategory(place.types),
    address: place.formattedAddress,
    city: extractCity(place.addressComponents),
    postcode: extractPostcode(place.addressComponents),
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    phone: place.internationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    opening_hours: place.regularOpeningHours?.weekdayDescriptions
      ? { weekdays: place.regularOpeningHours.weekdayDescriptions }
      : null,
    source: "google",
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

type UserLocation = { latitude: number; longitude: number };

export function useRestaurantSearch(
  query: string,
  userLocation: UserLocation | null,
) {
  const [localResults, setLocalResults] = useState<SearchResult[]>([]);
  const [googleResults, setGoogleResults] = useState<MappedGoogleResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Ref pour ne pas déclencher le debounce quand seule la localisation change
  const locationRef = useRef(userLocation);
  useEffect(() => {
    locationRef.current = userLocation;
  }, [userLocation]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 3) {
      setLocalResults([]);
      setGoogleResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const loc = locationRef.current;
        const lat = loc?.latitude  ?? 50.8503; // Bruxelles centre
        const lng = loc?.longitude ?? 4.3517;

        // ── 1. Recherche locale Supabase ──────────────────────────────────────
        const { data: localData } = await supabase.rpc("search_restaurants", {
          search_query: trimmed,
          user_lat: lat,
          user_lng: lng,
        });
        const local = (localData as SearchResult[]) ?? [];
        setLocalResults(local);

        // ── 2. Fallback Google si < 3 résultats locaux ────────────────────────
        if (local.length < 3 && loc) {
          const places = await searchGooglePlaces(trimmed, lat, lng);

          if (places.length > 0) {
            // Dédoublonner en parallèle
            const checks = await Promise.all(
              places.map(async (place) => {
                const { data } = await supabase.rpc("find_duplicate_restaurant", {
                  search_name: place.displayName.text,
                  search_lat: place.location.latitude,
                  search_lng: place.location.longitude,
                });
                return {
                  place,
                  isDuplicate: Array.isArray(data) && data.length > 0,
                };
              }),
            );

            setGoogleResults(
              checks
                .filter(({ isDuplicate }) => !isDuplicate)
                .map(({ place }) => mapGooglePlace(place)),
            );
          } else {
            setGoogleResults([]);
          }
        } else {
          setGoogleResults([]);
        }
      } catch {
        // Dégradation silencieuse — on n'affiche pas d'erreur
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]); // location gérée via ref → pas de re-trigger au changement de position

  return { localResults, googleResults, isLoading };
}
