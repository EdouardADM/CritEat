import * as Location from "expo-location";
import { getCurrentPosition } from "./useCurrentPosition";
import { haversineDistanceM, REVIEW_DISTANCE_THRESHOLD_M } from "../lib/geo";

export type DistanceCheckStatus =
  | "in_range"         // < 200 m, OK
  | "out_of_range"     // ≥ 200 m, bloqué
  | "permission_denied"// permission GPS refusée
  | "gps_timeout"      // 8 s sans fix
  | "unknown_error";   // erreur inattendue

export type DistanceCheckResult = {
  status: DistanceCheckStatus;
  distance_m: number | null;
  accuracy_m: number | null;
  user_lat: number | null;
  user_lng: number | null;
};

/**
 * Vérifie si l'utilisateur est dans le rayon de 200 m du restaurant.
 * Ne throw jamais — retourne un status explicite dans tous les cas.
 */
export async function checkDistanceToRestaurant(
  restaurantLat: number,
  restaurantLng: number,
): Promise<DistanceCheckResult> {
  let position;
  try {
    position = await getCurrentPosition();
  } catch {
    return { status: "unknown_error", distance_m: null, accuracy_m: null, user_lat: null, user_lng: null };
  }

  if (position === null) {
    // getCurrentPosition retourne null si permission refusée OU timeout.
    // On distingue les deux en relisant le statut de permission.
    try {
      const { status: permStatus } = await Location.getForegroundPermissionsAsync();
      return {
        status: permStatus === "granted" ? "gps_timeout" : "permission_denied",
        distance_m: null,
        accuracy_m: null,
        user_lat: null,
        user_lng: null,
      };
    } catch {
      return { status: "unknown_error", distance_m: null, accuracy_m: null, user_lat: null, user_lng: null };
    }
  }

  const distance = haversineDistanceM(
    position.lat, position.lng,
    restaurantLat, restaurantLng,
  );

  return {
    status: distance <= REVIEW_DISTANCE_THRESHOLD_M ? "in_range" : "out_of_range",
    distance_m: Math.round(distance),
    accuracy_m: position.accuracy,
    user_lat: position.lat,
    user_lng: position.lng,
  };
}
