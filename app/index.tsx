import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapLibreGL, { setAccessToken } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SearchBar from "../components/SearchBar";
import SearchResults from "../components/SearchResults";
import RestaurantPreviewCard from "../components/RestaurantPreviewCard";
import { useRestaurants, type MapBounds, type Restaurant } from "../hooks/useRestaurants";
import {
  useRestaurantSearch,
  type MappedGoogleResult,
  type SearchResult,
} from "../hooks/useRestaurantSearch";
import { supabase } from "../lib/supabase";
import { CATEGORY_CONFIG } from "../constants/categories";

// Pas de token requis pour OpenFreeMap
setAccessToken(null);

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type Coords = { latitude: number; longitude: number };

// ── Expressions de style MapLibre ─────────────────────────────────────────────

// ['match', ['get', 'category'], 'french', '#2563EB', ..., '#6B7280']
const CATEGORY_COLOR_EXPR = [
  "match", ["get", "category"],
  ...Object.entries(CATEGORY_CONFIG).flatMap(([k, v]) => [k, v.color]),
  CATEGORY_CONFIG.other.color,
];

// Rayon du cercle interpolé selon popularity_score (0→5px, 70→7px, 100→9px)
const CIRCLE_RADIUS_EXPR = [
  "interpolate", ["linear"],
  ["coalesce", ["get", "popularity_score"], 0],
  0, 5,
  70, 7,
  100, 9,
];

// ── Conversion restaurants → GeoJSON ─────────────────────────────────────────

function restaurantsToGeoJSON(restaurants: Restaurant[]) {
  return {
    type: "FeatureCollection" as const,
    features: restaurants.map((r) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        // GeoJSON : [longitude, latitude]
        coordinates: [r.longitude, r.latitude],
      },
      properties: {
        id: r.id,
        place_id: r.place_id,
        name: r.name,
        category: r.category,
        address: r.address,
        city: r.city,
        composite_score: r.composite_score,
        popularity_score: r.popularity_score,
        review_count: r.review_count,
      },
    })),
  };
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapLibreGL.MapView>(null);
  const cameraRef = useRef<MapLibreGL.Camera>(null);

  // ── GPS ─────────────────────────────────────────────────────────────────────
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);

  // ── Carte ───────────────────────────────────────────────────────────────────
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [currentZoom, setCurrentZoom] = useState(13);

  // ── Recherche ───────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  // ── Fiche restaurant ────────────────────────────────────────────────────────
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState("");
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // ── Init GPS ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // TODO(DEBUG): Localisation désactivée → fallback Bruxelles. À SUPPRIMER avant prod.
        setUserCoords({ latitude: 50.8503, longitude: 4.3517 });
        setGpsLoading(false);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        // TODO(DEBUG): GPS indisponible → fallback Bruxelles. À SUPPRIMER avant prod.
        setUserCoords({ latitude: 50.8503, longitude: 4.3517 });
      } finally {
        setGpsLoading(false);
      }
    })();
  }, []);

  // ── Restaurants (fetch + cache) ──────────────────────────────────────────────
  const { restaurants, loading: restaurantsLoading } = useRestaurants(mapBounds);

  // ── Recherche (debounce 400ms) ───────────────────────────────────────────────
  const { localResults, googleResults, isLoading: isSearchLoading } =
    useRestaurantSearch(searchQuery, userCoords);

  // ── GeoJSON (recalculé uniquement si restaurants change) ─────────────────────
  const restaurantsGeoJSON = useMemo(() => restaurantsToGeoJSON(restaurants), [restaurants]);

  // ── Toast helper ─────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [toastOpacity]);

  // ── Mise à jour bounds quand la carte se déplace ─────────────────────────────
  const handleRegionChange = useCallback(async () => {
    if (!mapRef.current) return;
    try {
      const zoom = await mapRef.current.getZoom();
      const bounds = await mapRef.current.getVisibleBounds();
      // bounds[0] = NE [lngMax, latMax] — bounds[1] = SW [lngMin, latMin]
      const roundedZoom = Math.round(zoom);
      setCurrentZoom(roundedZoom);
      setMapBounds({
        minLat: bounds[1][1],
        maxLat: bounds[0][1],
        minLng: bounds[1][0],
        maxLng: bounds[0][0],
        zoom: roundedZoom,
      });
    } catch {
      // Carte pas encore prête
    }
  }, []);

  // ── Tap sur un cluster ou un restaurant ──────────────────────────────────────
  const handleShapePress = useCallback(async (event: { features: Array<{
    geometry: { coordinates: number[] };
    properties: Record<string, unknown>;
  }> }) => {
    const feature = event.features?.[0];
    if (!feature) return;

    if (feature.properties?.cluster === true) {
      // Zoomer sur le cluster
      const zoom = await mapRef.current?.getZoom();
      cameraRef.current?.setCamera({
        centerCoordinate: feature.geometry.coordinates as [number, number],
        zoomLevel: Math.min((zoom ?? 13) + 2, 18),
        animationDuration: 400,
      });
    } else {
      // Afficher la preview du restaurant
      const p = feature.properties;
      setSelectedRestaurant({
        id: String(p.id ?? ""),
        place_id: String(p.place_id ?? ""),
        name: String(p.name ?? ""),
        category: String(p.category ?? "other"),
        address: String(p.address ?? ""),
        city: String(p.city ?? ""),
        composite_score: p.composite_score != null ? Number(p.composite_score) : null,
        popularity_score: p.popularity_score != null ? Number(p.popularity_score) : null,
        review_count: Number(p.review_count ?? 0),
        // GeoJSON : coordinates = [lng, lat]
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
      });
      setShowResults(false);
    }
  }, []);

  // ── Recentrer sur l'utilisateur ──────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    if (!userCoords) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [userCoords.longitude, userCoords.latitude],
      zoomLevel: 14,
      animationDuration: 500,
    });
  }, [userCoords]);

  // ── Fermer la recherche ──────────────────────────────────────────────────────
  const dismissSearch = useCallback(() => setShowResults(false), []);

  // ── Sélection résultat local ─────────────────────────────────────────────────
  const handleSelectLocal = useCallback((result: SearchResult) => {
    setShowResults(false);
    setSearchQuery("");
    cameraRef.current?.setCamera({
      centerCoordinate: [result.longitude, result.latitude],
      zoomLevel: 16,
      animationDuration: 400,
    });
  }, []);

  // ── Sélection résultat Google ────────────────────────────────────────────────
  const handleSelectGoogle = useCallback((result: MappedGoogleResult) => {
    setShowResults(false);
    setSearchQuery("");
    cameraRef.current?.setCamera({
      centerCoordinate: [result.longitude, result.latitude],
      zoomLevel: 16,
      animationDuration: 400,
    });

    // Supabase en arrière-plan (ne bloque pas l'animation)
    void (async () => {
      try {
        const { data: dupData } = await supabase.rpc("find_duplicate_restaurant", {
          search_name: result.name,
          search_lat: result.latitude,
          search_lng: result.longitude,
        });
        const duplicate = (dupData as { id: string; name: string; place_id: string }[] | null)?.[0];

        if (duplicate) {
          const { data: existing } = await supabase
            .from("restaurants")
            .select("phone, website")
            .eq("id", duplicate.id)
            .single();

          const updates: Record<string, string> = {};
          if (!existing?.phone && result.phone) updates.phone = result.phone;
          if (!existing?.website && result.website) updates.website = result.website;

          if (Object.keys(updates).length > 0) {
            await supabase.from("restaurants").update(updates).eq("id", duplicate.id);
          }
        } else {
          await supabase.rpc("batch_upsert_restaurants", {
            restaurants: [{
              place_id:        result.place_id,
              name:            result.name,
              category:        result.category,
              address:         result.address,
              city:            result.city,
              postcode:        result.postcode,
              latitude:        result.latitude,
              longitude:       result.longitude,
              phone:           result.phone,
              website:         result.website,
              opening_hours:   result.opening_hours,
              description:     null,
              takeaway:        null,
              delivery:        null,
              outdoor_seating: null,
              wheelchair:      null,
              diet_options:    null,
              source:          "google",
            }],
          });
          showToast("Restaurant ajouté à Criteat !");
        }
      } catch {
        // Dégradation silencieuse — la carte a quand même navigué
      }
    })();
  }, [showToast]);

  // ── Handlers recherche ───────────────────────────────────────────────────────
  const handleQueryChange = useCallback((text: string) => {
    setSearchQuery(text);
    setShowResults(text.trim().length >= 3);
    if (text.trim().length > 0) setSelectedRestaurant(null);
  }, []);

  const handleSearchFocus = useCallback(() => {
    if (searchQuery.trim().length >= 3) setShowResults(true);
  }, [searchQuery]);

  const handleClear = useCallback(() => {
    setSearchQuery("");
    setShowResults(false);
  }, []);

  // ── États GPS ────────────────────────────────────────────────────────────────
  if (gpsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E8472A" />
        <Text style={styles.hint}>Récupération de la position…</Text>
      </View>
    );
  }

  if (gpsError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{gpsError}</Text>
      </View>
    );
  }

  if (!userCoords) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Position indisponible.</Text>
      </View>
    );
  }

  const showZoomHint = currentZoom < 10 && !showResults;
  const recenterBottom = insets.bottom + (selectedRestaurant ? 170 : 32);

  // ── Rendu ────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Carte MapLibre — OpenFreeMap (gratuit, open-source, pas de clé) */}
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={STYLE_URL}
        onRegionDidChange={handleRegionChange}
        onDidFinishLoadingMap={handleRegionChange}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={true}
        compassViewPosition={3}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [userCoords.longitude, userCoords.latitude],
            zoomLevel: 13,
          }}
        />

        {/* Point GPS de l'utilisateur (natif MapLibre) */}
        <MapLibreGL.UserLocation visible animated />

        {/* Restaurants : clustering natif GPU */}
        <MapLibreGL.ShapeSource
          id="restaurants"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          shape={restaurantsGeoJSON as any}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={14}
          onPress={handleShapePress}
        >
          {/* ── Cercles de cluster ── */}
          <MapLibreGL.CircleLayer
            id="clusters"
            minZoomLevel={10}
            filter={["has", "point_count"]}
            style={{
              circleColor: "#E8472A",
              circleOpacity: 0.88,
              circleRadius: [
                "step", ["get", "point_count"],
                18,        // count < 10
                10,  22,   // count 10-49
                50,  28,   // count 50-199
                200, 34,   // count ≥ 200
              ],
              circleStrokeColor: "rgba(232, 71, 42, 0.25)",
              circleStrokeWidth: 8,
            }}
          />

          {/* ── Compteur du cluster ── */}
          <MapLibreGL.SymbolLayer
            id="cluster-count"
            minZoomLevel={10}
            filter={["has", "point_count"]}
            style={{
              textField: ["get", "point_count_abbreviated"],
              textSize: 13,
              textColor: "#FFFFFF",
              textFont: ["Open Sans Bold", "Arial Unicode MS Bold"],
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />

          {/* ── Marqueurs individuels ── */}
          <MapLibreGL.CircleLayer
            id="restaurants-dots"
            minZoomLevel={10}
            filter={["!", ["has", "point_count"]]}
            style={{
              circleColor: CATEGORY_COLOR_EXPR,
              circleRadius: CIRCLE_RADIUS_EXPR,
              circleStrokeColor: "#FFFFFF",
              circleStrokeWidth: 1.5,
              circleOpacity: 0.95,
            }}
          />
        </MapLibreGL.ShapeSource>
      </MapLibreGL.MapView>

      {/* Backdrop : ferme la liste quand on tape la carte */}
      {showResults && (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={dismissSearch}
        />
      )}

      {/* Overlay recherche */}
      <View
        style={[styles.searchOverlay, { top: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <SearchBar
          value={searchQuery}
          onChangeText={handleQueryChange}
          onFocus={handleSearchFocus}
          onClear={handleClear}
          isLoading={isSearchLoading}
        />
        {showResults && (
          <SearchResults
            localResults={localResults}
            googleResults={googleResults}
            userLocation={userCoords}
            isLoading={isSearchLoading}
            onSelectLocal={handleSelectLocal}
            onSelectGoogle={handleSelectGoogle}
          />
        )}
      </View>

      {/* Badge chargement restaurants */}
      {restaurantsLoading && !showResults && (
        <View style={[styles.loadingBadge, { top: insets.top + 68 }]}>
          <ActivityIndicator size="small" color="#E8472A" />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      )}

      {/* Invitation à zoomer */}
      {showZoomHint && (
        <View style={styles.zoomHint} pointerEvents="none">
          <Text style={styles.zoomHintText}>Zoomez pour voir les restaurants</Text>
        </View>
      )}

      {/* Bouton recentrer */}
      <Pressable
        style={[styles.recenterBtn, { bottom: recenterBottom }]}
        onPress={handleRecenter}
      >
        <Text style={styles.recenterIcon}>◎</Text>
      </Pressable>

      {/* Preview restaurant au tap */}
      {selectedRestaurant && (
        <RestaurantPreviewCard
          restaurant={selectedRestaurant}
          onClose={() => setSelectedRestaurant(null)}
          bottomInset={insets.bottom}
        />
      )}

      {/* Toast */}
      <Animated.View
        style={[
          styles.toast,
          { opacity: toastOpacity, bottom: insets.bottom + 32 },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.toastText}>{toastMessage}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  hint: { color: "#888", fontSize: 14 },
  errorText: {
    color: "#E8472A",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },

  // ── Recherche ──────────────────────────────────────────────────────────────
  backdrop: { zIndex: 10 },
  searchOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 20,
  },

  // ── Badge chargement ───────────────────────────────────────────────────────
  loadingBadge: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 15,
  },
  loadingText: { fontSize: 13, color: "#555" },

  // ── Hint zoom ──────────────────────────────────────────────────────────────
  zoomHint: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  zoomHintText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // ── Bouton recentrer ───────────────────────────────────────────────────────
  recenterBtn: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 15,
  },
  recenterIcon: { fontSize: 22, color: "#E8472A" },

  // ── Toast ──────────────────────────────────────────────────────────────────
  toast: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 100,
  },
  toastText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
