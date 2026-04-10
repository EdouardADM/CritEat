import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapLibreGL from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SearchBar from "../../components/SearchBar";
import SearchResults from "../../components/SearchResults";
import RestaurantPreviewCard from "../../components/RestaurantPreviewCard";
import FilterBar from "../../components/FilterBar";
import { useRestaurants, type MapBounds, type Restaurant } from "../../hooks/useRestaurants";
import {
  useRestaurantSearch,
  type MappedGoogleResult,
  type SearchResult,
} from "../../hooks/useRestaurantSearch";
import { supabase } from "../../lib/supabase";
import { type RestaurantCategory } from "../../constants/categories";
import { restaurantsToGeoJSON } from "../../utils/geo";

type Coords = { latitude: number; longitude: number };

// Style OpenFreeMap (gratuit, pas de clé API)
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Fallback raster OSM si OpenFreeMap n'est pas disponible
const FALLBACK_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Expression MapLibre : couleur par catégorie (correspond à CATEGORY_CONFIG)
const CATEGORY_COLOR_EXPRESSION = [
  "match",
  ["get", "category"],
  "french",        "#2563EB",
  "italian",       "#16A34A",
  "japanese",      "#DC2626",
  "chinese",       "#EA580C",
  "american",      "#7C3AED",
  "mexican",       "#B45309",
  "indian",        "#D97706",
  "thai",          "#0891B2",
  "mediterranean", "#0284C7",
  "fast_food",     "#F59E0B",
  "cafe",          "#92400E",
  "bakery",        "#CA8A04",
  "seafood",       "#0E7490",
  "vegetarian",    "#65A30D",
  /* default */    "#6B7280",
];

// ── Composant ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapLibreGL.MapView>(null);
  const cameraRef = useRef<MapLibreGL.Camera>(null);

  // ── GPS ─────────────────────────────────────────────────────────────────────
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);

  // ── Carte ───────────────────────────────────────────────────────────────────
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [currentZoom, setCurrentZoom] = useState(13);

  // ── Recherche ───────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  // ── Filtres catégories ───────────────────────────────────────────────────────
  const [activeCategories, setActiveCategories] = useState<RestaurantCategory[]>([]);

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

  // ── Filtrage + conversion GeoJSON ────────────────────────────────────────────
  const visibleRestaurants = useMemo(
    () =>
      activeCategories.length === 0
        ? restaurants
        : restaurants.filter((r) =>
            activeCategories.includes(r.category as RestaurantCategory)
          ),
    [restaurants, activeCategories]
  );

  const restaurantsGeoJSON = useMemo(
    () => restaurantsToGeoJSON(visibleRestaurants),
    [visibleRestaurants]
  );

  // ── Toggle filtre catégorie ──────────────────────────────────────────────────
  const handleToggleCategory = useCallback((category: RestaurantCategory) => {
    setActiveCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }, []);

  // ── Toast helper ─────────────────────────────────────────────────────────────
  const showToast = useCallback(
    (message: string) => {
      setToastMessage(message);
      Animated.sequence([
        Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    },
    [toastOpacity]
  );

  // ── Mise à jour bounds quand la carte se déplace ─────────────────────────────
  const handleRegionChange = useCallback(async () => {
    if (!mapRef.current) return;
    try {
      const zoom = await mapRef.current.getZoom();
      const bounds = await mapRef.current.getVisibleBounds();
      if (bounds) {
        // bounds = [[lngEast, latNorth], [lngWest, latSouth]]
        const [ne, sw] = bounds;
        const roundedZoom = Math.round(zoom);
        setCurrentZoom(roundedZoom);
        setMapBounds({
          minLat: sw[1],
          minLng: sw[0],
          maxLat: ne[1],
          maxLng: ne[0],
          zoom: roundedZoom,
        });
      }
    } catch {
      // La carte n'est peut-être pas encore prête
    }
  }, []);

  // ── Tap sur un point ou cluster dans le ShapeSource ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRestaurantPress = useCallback(async (event: any) => {
    const feature = event.features?.[0];
    if (!feature) return;

    if (feature.properties?.point_count) {
      // Cluster → zoomer dessus
      const zoom = (await mapRef.current?.getZoom()) ?? 13;
      cameraRef.current?.setCamera({
        centerCoordinate: feature.geometry.coordinates,
        zoomLevel: zoom + 2,
        animationDuration: 500,
      });
    } else {
      // Restaurant individuel → afficher la preview card
      const props = feature.properties as {
        id: string;
        place_id: string;
        name: string;
        category: string;
        address: string;
        city: string;
        composite_score: number | null;
        popularity_score: number | null;
        review_count: number;
      };
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      setSelectedRestaurant({
        id: props.id,
        place_id: props.place_id,
        name: props.name,
        category: props.category,
        address: props.address,
        city: props.city,
        latitude: lat,
        longitude: lng,
        composite_score: props.composite_score,
        popularity_score: props.popularity_score,
        review_count: props.review_count,
      });
      // Décale légèrement vers le bas pour que le marqueur reste visible au-dessus de la fiche
      cameraRef.current?.setCamera({
        centerCoordinate: [lng, lat - 0.002],
        zoomLevel: 16,
        animationDuration: 350,
      });
    }
  }, []);

  // ── Tap sur le fond de carte → ferme la fiche ────────────────────────────────
  const handleMapPress = useCallback(() => {
    if (showResults) return;
    setSelectedRestaurant(null);
  }, [showResults]);

  // ── Recentrer sur l'utilisateur ──────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    if (!userCoords) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [userCoords.longitude, userCoords.latitude],
      zoomLevel: 14,
      animationMode: "flyTo",
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
      animationMode: "flyTo",
      animationDuration: 400,
    });
  }, []);

  // ── Sélection résultat Google ────────────────────────────────────────────────
  const handleSelectGoogle = useCallback(
    (result: MappedGoogleResult) => {
      setShowResults(false);
      setSearchQuery("");
      cameraRef.current?.setCamera({
        centerCoordinate: [result.longitude, result.latitude],
        zoomLevel: 16,
        animationMode: "flyTo",
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
          const duplicate = (
            dupData as { id: string; name: string; place_id: string }[] | null
          )?.[0];

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
              restaurants: [
                {
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
                },
              ],
            });
            showToast("Restaurant ajouté à Criteat !");
          }
        } catch {
          // Dégradation silencieuse — la carte a quand même navigué
        }
      })();
    },
    [showToast]
  );

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
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={OPENFREEMAP_STYLE}
        compassEnabled={true}
        logoEnabled={false}
        attributionEnabled={true}
        attributionPosition={{ bottom: 8, left: 8 }}
        onRegionDidChange={handleRegionChange}
        onPress={handleMapPress}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          centerCoordinate={[userCoords.longitude, userCoords.latitude]}
          zoomLevel={13}
          animationDuration={0}
        />

        <MapLibreGL.UserLocation visible={true} animated={true} />

        <MapLibreGL.ShapeSource
          id="restaurants"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          shape={restaurantsGeoJSON as any}
          cluster={true}
          clusterRadius={50}
          clusterMaxZoomLevel={14}
          onPress={handleRestaurantPress}
        >
          {/* Cercles pour les clusters */}
          <MapLibreGL.CircleLayer
            id="clusters"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter={["has", "point_count"] as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            style={{
              circleColor: "#E8593C",
              circleRadius: [
                "step",
                ["get", "point_count"],
                15, 50, 20, 100, 25, 500, 35,
              ] as any,
              circleOpacity: 0.85,
              circleStrokeColor: "#FFFFFF",
              circleStrokeWidth: 2,
            }}
          />

          {/* Nombre dans les clusters */}
          <MapLibreGL.SymbolLayer
            id="cluster-count"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter={["has", "point_count"] as any}
            style={{
              textField: ["get", "point_count_abbreviated"] as any,
              textSize: 13,
              textColor: "#FFFFFF",
              textFont: ["Open Sans Bold", "Arial Unicode MS Bold"],
              textAllowOverlap: true,
            }}
          />

          {/* Marqueurs individuels (cercles colorés par catégorie) */}
          <MapLibreGL.CircleLayer
            id="restaurant-points"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter={["!", ["has", "point_count"]] as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            style={{
              circleColor: CATEGORY_COLOR_EXPRESSION as any,
              circleRadius: [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "popularity_score"], 0],
                0, 5, 50, 7, 100, 9,
              ] as any,
              circleStrokeColor: "#FFFFFF",
              circleStrokeWidth: 1.5,
              circleOpacity: 0.9,
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

      {/* Filtres catégories */}
      {!showResults && (
        <View
          style={[styles.filterOverlay, { top: insets.top + 64 }]}
          pointerEvents="box-none"
        >
          <FilterBar
            activeCategories={activeCategories}
            onToggle={handleToggleCategory}
          />
        </View>
      )}

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
        <Ionicons name="locate" size={22} color="#E8472A" />
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

// ── Styles ────────────────────────────────────────────────────────────────────

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

  // ── Filtres ────────────────────────────────────────────────────────────────
  filterOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
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
