import * as Location from "expo-location";

export type CapturedLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: string; // ISO 8601
};

const TIMEOUT_MS = 8_000;

/**
 * Lecture GPS one-shot au moment d'un pick photo.
 * - Demande la permission si nécessaire
 * - Timeout dur de 8 s (ne bloque pas le flow d'avis)
 * - Retourne null si permission refusée ou GPS indisponible
 * - Ne throw jamais
 */
export async function getCurrentPosition(): Promise<CapturedLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const pos = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("GPS timeout")), TIMEOUT_MS),
      ),
    ]);

    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: new Date(pos.timestamp).toISOString(),
    };
  } catch {
    return null;
  }
}
