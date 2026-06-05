import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { useUserReviewedRestaurants, boundsOf } from "../hooks/useUserReviewedRestaurants";
import { restaurantsToGeoJSON } from "../utils/geo";
import { OSM_RASTER_STYLE, CATEGORY_COLOR_EXPRESSION } from "../constants/mapStyle";

// Aperçu de carte sur le profil : affiche uniquement les restaurants notés par
// l'utilisateur. Un overlay transparent capte le tap (→ carte plein écran) sans
// bloquer le défilement de la page (le drag est laissé au ScrollView parent).
export default function ProfileMiniMap({ userId }: { userId: string }) {
  const router = useRouter();
  const cameraRef = useRef<CameraRef>(null);
  const { restaurants, loading } = useUserReviewedRestaurants(userId);

  const bounds = boundsOf(restaurants);
  const center: [number, number] = bounds
    ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
    : [4.3517, 50.8503];

  useEffect(() => {
    if (!bounds) return;
    const t = setTimeout(() => {
      cameraRef.current?.fitBounds(
        [bounds[0], bounds[1], bounds[2], bounds[3]],
        { padding: { top: 24, right: 24, bottom: 24, left: 24 }, duration: 0 },
      );
    }, 350);
    return () => clearTimeout(t);
  }, [restaurants]);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Carte des restos notés</Text>

      {loading ? (
        <View style={[styles.card, styles.centered]}>
          <ActivityIndicator color="#E8472A" />
        </View>
      ) : restaurants.length === 0 ? (
        <View style={[styles.card, styles.centered]}>
          <Ionicons name="map-outline" size={28} color="#D1D5DB" />
          <Text style={styles.emptyText}>Aucun restaurant noté</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Map
            style={styles.map}
            mapStyle={OSM_RASTER_STYLE}
            logo={false}
            compass={false}
            attribution={false}
          >
            <Camera ref={cameraRef} initialViewState={{ center, zoom: 11 }} />
            <GeoJSONSource
              id="profile-restaurants"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data={restaurantsToGeoJSON(restaurants) as any}
            >
              <Layer
                type="circle"
                id="profile-points"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                paint={{
                  "circle-color": CATEGORY_COLOR_EXPRESSION as any,
                  "circle-radius": 6,
                  "circle-stroke-color": "#FFFFFF",
                  "circle-stroke-width": 1.5,
                }}
              />
            </GeoJSONSource>
          </Map>

          {/* Overlay : tap → carte plein écran ; le drag défile la page */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() =>
              router.push({ pathname: "/profile-map", params: { userId } })
            }
          >
            <View style={styles.badge}>
              <Ionicons name="restaurant" size={12} color="#fff" />
              <Text style={styles.badgeText}>
                {restaurants.length} resto{restaurants.length > 1 ? "s" : ""}
              </Text>
            </View>
            <View style={styles.hint}>
              <Text style={styles.hintText}>Voir la carte</Text>
              <Ionicons name="expand-outline" size={13} color="#fff" />
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 8 },
  title: { fontSize: 15, fontWeight: "700", color: "#1a1a1a" },
  card: {
    height: 190,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  centered: { alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 13, color: "#9CA3AF" },
  map: { flex: 1 },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(26,26,26,0.8)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  hint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(232,71,42,0.92)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  hintText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
