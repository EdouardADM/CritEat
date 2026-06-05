import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  type MapRef,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { useUserReviewedRestaurants, boundsOf } from "../hooks/useUserReviewedRestaurants";
import { restaurantsToGeoJSON } from "../utils/geo";
import { OSM_RASTER_STYLE, CATEGORY_COLOR_EXPRESSION } from "../constants/mapStyle";

export default function ProfileMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  const { restaurants, loading, error } = useUserReviewedRestaurants(userId ?? "");
  const bounds = boundsOf(restaurants);
  const center: [number, number] = bounds
    ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
    : [4.3517, 50.8503];

  useEffect(() => {
    if (!bounds) return;
    const t = setTimeout(() => {
      cameraRef.current?.fitBounds(
        [bounds[0], bounds[1], bounds[2], bounds[3]],
        { padding: { top: 100, right: 50, bottom: 80, left: 50 }, duration: 500 },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [restaurants]);

  // Tap sur la carte → si un marqueur est touché, ouvre la fiche restaurant.
  const handleMapPress = async (event: any) => {
    const [x, y] = event.nativeEvent.point as [number, number];
    try {
      const features = await mapRef.current?.queryRenderedFeatures([x, y], {
        layers: ["profile-points-full"],
      });
      const id = features?.[0]?.properties?.id;
      if (id) router.push(`/restaurant/${id}`);
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.root}>
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={OSM_RASTER_STYLE}
        logo={false}
        compass
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
        onPress={handleMapPress}
      >
        <Camera ref={cameraRef} initialViewState={{ center, zoom: 11 }} />
        <GeoJSONSource
          id="profile-restaurants-full"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={restaurantsToGeoJSON(restaurants) as any}
        >
          <Layer
            type="circle"
            id="profile-points-full"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            paint={{
              "circle-color": CATEGORY_COLOR_EXPRESSION as any,
              "circle-radius": 8,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
            }}
          />
        </GeoJSONSource>
      </Map>

      {/* Header */}
      <View style={[styles.header, { top: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color="#1a1a1a" />
        </Pressable>
        <View style={styles.titlePill}>
          <Text style={styles.titleText}>Restaurants notés</Text>
        </View>
      </View>

      {loading && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#E8472A" />
        </View>
      )}

      {!loading && !error && restaurants.length === 0 && (
        <View style={styles.overlay} pointerEvents="none">
          <Ionicons name="map-outline" size={36} color="#9CA3AF" />
          <Text style={styles.emptyText}>Aucun restaurant noté</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },
  map: { flex: 1 },
  header: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  titlePill: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  titleText: { fontSize: 14, fontWeight: "700", color: "#1a1a1a" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyText: { fontSize: 15, color: "#9CA3AF" },
});
