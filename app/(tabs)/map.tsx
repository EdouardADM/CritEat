import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  UserLocation,
  ViewAnnotation,
  type MapRef,
  type CameraRef,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SearchBar, { type SearchBarHandle } from "../../components/SearchBar";
import SearchResults from "../../components/SearchResults";
import RestaurantPreviewCard from "../../components/RestaurantPreviewCard";
import FilterBar from "../../components/FilterBar";
import { useRestaurants, type MapBounds, type Restaurant } from "../../hooks/useRestaurants";
import {
  useRestaurantSearch,
  type SearchResult,
} from "../../hooks/useRestaurantSearch";
import { type RestaurantCategory, getCategoryConfig } from "../../constants/categories";
import { restaurantsToGeoJSON } from "../../utils/geo";

type Coords = { latitude: number; longitude: number };

// Style OpenFreeMap (gratuit, pas de clé API)
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Fallback raster OSM si OpenFreeMap n'est pas disponible
const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
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

// ── Échelle de carte ──────────────────────────────────────────────────────────

const SCALE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const SCALE_TARGET_PX = 80;

function computeScaleBar(zoom: number, lat: number): { width: number; label: string } {
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const targetMeters = metersPerPixel * SCALE_TARGET_PX;
  const distance = SCALE_STEPS.reduce((best, step) =>
    Math.abs(step - targetMeters) < Math.abs(best - targetMeters) ? step : best
  );
  const width = distance / metersPerPixel;
  const label = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`;
  return { width, label };
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const searchBarRef = useRef<SearchBarHandle>(null);

  const isRestaurantSelectedRef = useRef(false);
  const selectedRestaurantRef = useRef<Restaurant | null>(null);
  const showResultsRef = useRef(false);
  const ignoreNextQueryChangeRef = useRef(false);

  // ── GPS ─────────────────────────────────────────────────────────────────────
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  // ── Carte ───────────────────────────────────────────────────────────────────
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  // currentZoom est un ref (pas state) pour éviter les re-renders à chaque pan/zoom.
  const currentZoomRef = useRef(13);
  // Booléen d'état uniquement pour afficher/masquer le hint de zoom (change rarement)
  const [showZoomHint, setShowZoomHint] = useState(false);

  // ── Recherche ───────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  useEffect(() => { showResultsRef.current = showResults; }, [showResults]);

  // ── Filtres catégories ───────────────────────────────────────────────────────
  const [activeCategories, setActiveCategories] = useState<RestaurantCategory[]>([]);

  // ── Visibilité overlay (masqués par la bottom sheet en mid/full) ─────────────
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [searchVisible, setSearchVisible]   = useState(true);

  // ── Fiche restaurant ────────────────────────────────────────────────────────
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  useEffect(() => { selectedRestaurantRef.current = selectedRestaurant; }, [selectedRestaurant]);

  // ── Échelle de carte ────────────────────────────────────────────────────────
  const [scaleBar, setScaleBar] = useState(() => computeScaleBar(12, 50.8503));

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState("");
  const toastOpacity = useRef(new Animated.Value(0)).current;


  // ── Restaurants (fetch + cache) ──────────────────────────────────────────────
  const { restaurants, loading: restaurantsLoading } = useRestaurants(mapBounds);

  // ── Recherche (debounce 400ms) ───────────────────────────────────────────────
  const { localResults, isLoading: isSearchLoading } =
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

  // GeoJSON affiché dans le GeoJSONSource : exclut le restaurant sélectionné
  // (il est rendu en surbrillance via ViewAnnotation)
  const displayGeoJSON = useMemo(() => {
    if (!selectedRestaurant) return restaurantsGeoJSON;
    return {
      ...restaurantsGeoJSON,
      features: restaurantsGeoJSON.features.filter(
        (f) => f.properties.place_id !== selectedRestaurant.place_id
      ),
    };
  }, [restaurantsGeoJSON, selectedRestaurant]);

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

  // ── Mise à jour de l'échelle en temps réel (pendant le geste) ───────────────
  // v11 : l'event est NativeSyntheticEvent<ViewStateChangeEvent>
  // bounds = [west, south, east, north]
  const handleScaleUpdate = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { zoom, bounds } = event.nativeEvent;
      requestAnimationFrame(() => {
        setScaleBar(computeScaleBar(zoom, (bounds[3] + bounds[1]) / 2));
      });
      // Ferme le clavier seulement si l'utilisateur pan/zoom manuellement
      if (!isRestaurantSelectedRef.current) {
        Keyboard.dismiss();
        searchBarRef.current?.blur();
      }
    },
    []
  );

  const handleRegionChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { zoom, bounds } = event.nativeEvent;
      // bounds = [west, south, east, north]
      const roundedZoom = Math.round(zoom);
      currentZoomRef.current = roundedZoom;
      // Re-render uniquement si on franchit le seuil du hint (< 10)
      setShowZoomHint(prev => {
        const hint = roundedZoom < 10;
        return prev === hint ? prev : hint;
      });
      // Échelle : mise à jour finale (sync avec les bounds)
      setScaleBar(computeScaleBar(zoom, (bounds[3] + bounds[1]) / 2));
      if (isRestaurantSelectedRef.current) return;
      setMapBounds({
        minLat: bounds[1],
        minLng: bounds[0],
        maxLat: bounds[3],
        maxLng: bounds[2],
        zoom: roundedZoom,
      });
    },
    []
  );

  // ── Navigation caméra (API impérative v11) ───────────────────────────────────
  const moveCameraTo = useCallback((
    center: [number, number],
    zoom: number,
    animationMode: "flyTo" | "easeTo" | "none" = "flyTo",
    animationDuration = 400,
  ) => {
    if (animationMode === "flyTo") {
      cameraRef.current?.flyTo({ center, zoom, duration: animationDuration });
    } else if (animationMode === "easeTo") {
      cameraRef.current?.easeTo({ center, zoom, duration: animationDuration });
    } else {
      cameraRef.current?.jumpTo({ center, zoom });
    }
  }, []);

  // ── Init GPS ─────────────────────────────────────────────────────────────────
  // La carte s'affiche immédiatement (centrée sur Bruxelles).
  // Dès que le GPS répond, on vole vers la position réelle.
  // Timeout 8s → fallback Bruxelles + Alert.
  useEffect(() => {
    const BRUSSELS: [number, number] = [4.3517, 50.8503];
    const fallback = () => {
      moveCameraTo(BRUSSELS, 12, "flyTo", 400);
      setUserCoords({ latitude: 50.8503, longitude: 4.3517 });
      setLocationLoading(false);
    };

    const timeoutId = setTimeout(() => {
      Alert.alert("Position non disponible", "Affichage centré sur Bruxelles.");
      fallback();
    }, 8000);

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        clearTimeout(timeoutId);
        Alert.alert("Position non disponible", "Affichage centré sur Bruxelles.");
        fallback();
        return;
      }
      let hadLastKnown = false;
      try {
        // Passe 1 : position en cache OS (instantané)
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          hadLastKnown = true;
          clearTimeout(timeoutId);
          const coords = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          setUserCoords(coords);
          moveCameraTo([coords.longitude, coords.latitude], 14, "flyTo", 400);
          setLocationLoading(false);
        }
        // Passe 2 : fix précis en arrière-plan
        const fresh = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        clearTimeout(timeoutId);
        const coords = { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
        setUserCoords(coords);
        if (!hadLastKnown) {
          moveCameraTo([coords.longitude, coords.latitude], 14, "flyTo", 400);
          setLocationLoading(false);
        }
      } catch {
        clearTimeout(timeoutId);
        fallback();
      }
    })();

    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tap sur un restaurant dans le GeoJSONSource ──────────────────────────────
  const handleRestaurantPress = useCallback((feature: any) => {
    if (!feature) return;
    const props = feature.properties;
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    isRestaurantSelectedRef.current = true;
    setSelectedRestaurant({
      id: props.id, place_id: props.place_id, name: props.name,
      category: props.category, address: props.address, city: props.city,
      latitude: lat, longitude: lng,
      composite_score: props.composite_score,
      popularity_score: props.popularity_score,
      review_count: props.review_count,
    });
    moveCameraTo([lng, lat], 16, "flyTo", 350);
  }, [moveCameraTo]);

  // ── Tap sur le fond de carte → ferme la fiche ────────────────────────────────
  // v11 : onPress fournit NativeSyntheticEvent<PressEvent> avec event.nativeEvent.point = [x, y]
  const handleMapPress = useCallback(async (event: any) => {
    if (showResultsRef.current) {
      Keyboard.dismiss();
      searchBarRef.current?.blur();
      setShowResults(false);
      return;
    }

    const [screenPointX, screenPointY] = event.nativeEvent.point as [number, number];

    try {
      const features = await mapRef.current?.queryRenderedFeatures(
        [screenPointX, screenPointY],
        { layers: ["restaurant-points"] }
      );

      if (features && features.length > 0) {
        handleRestaurantPress(features[0]);
        return;
      }
    } catch (e) {
      console.warn("Erreur de détection du clic:", e);
    }

    // Tap sur fond de carte → ferme la fiche si ouverte
    if (selectedRestaurantRef.current) {
      isRestaurantSelectedRef.current = false;
      setSelectedRestaurant(null);
    }
  }, [handleRestaurantPress]);

  // ── Recentrer sur l'utilisateur ──────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    if (!userCoords) return;
    moveCameraTo([userCoords.longitude, userCoords.latitude], 14, "flyTo", 500);
  }, [userCoords, moveCameraTo]);

  // ── Fermer la recherche ──────────────────────────────────────────────────────
  const dismissSearch = useCallback(() => {
    Keyboard.dismiss();
    searchBarRef.current?.blur();
    setShowResults(false);
  }, []);

  // ── Sélection résultat local ─────────────────────────────────────────────────
  const handleSelectLocal = useCallback((result: SearchResult) => {
    console.log("=== handleSelectLocal appelé ===");
    console.log("result:", result.name, result.lat, result.lng);

    // 1. Ferme tout d'abord — laisse React re-render sans backdrop
    setShowResults(false);
    setSearchQuery("");
    Keyboard.dismiss();
    ignoreNextQueryChangeRef.current = true;
    setTimeout(() => { ignoreNextQueryChangeRef.current = false; }, 1000);
    searchBarRef.current?.blur();

    console.log("showResults mis à false");

    // 2. Monte la preview card après que le backdrop est démonté
    setTimeout(() => {
      console.log("setTimeout(0) — avant setSelectedRestaurant");
      console.log("isRestaurantSelectedRef avant:", isRestaurantSelectedRef.current);

      isRestaurantSelectedRef.current = true;
      setSelectedRestaurant({
        id: result.id,
        place_id: result.place_id,
        name: result.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category: result.category as any,
        address: result.address,
        city: result.city,
        latitude: result.lat,
        longitude: result.lng,
        composite_score: result.composite_score,
        popularity_score: result.popularity_score,
        review_count: result.review_count,
      });
      moveCameraTo([result.lng, result.lat], 16, "flyTo", 400);

      console.log("setSelectedRestaurant appelé");
      console.log("isRestaurantSelectedRef après:", isRestaurantSelectedRef.current);
    }, 0);

    // 3. Force le fetch des restaurants autour de la nouvelle position
    setTimeout(() => {
      console.log("setTimeout(500) — force mapBounds");
      console.log("isRestaurantSelectedRef avant reset:", isRestaurantSelectedRef.current);
      isRestaurantSelectedRef.current = false;
      setMapBounds({
        minLat: result.lat - 0.005,
        minLng: result.lng - 0.008,
        maxLat: result.lat + 0.005,
        maxLng: result.lng + 0.008,
        zoom: 16,
      });
      isRestaurantSelectedRef.current = true;
      console.log("mapBounds mis à jour");
    }, 500);
  }, [moveCameraTo]);

  // ── Handlers recherche ───────────────────────────────────────────────────────
  const handleQueryChange = useCallback((text: string) => {
    if (ignoreNextQueryChangeRef.current) {
      ignoreNextQueryChangeRef.current = false;
      return;
    }
    setSearchQuery(text);
    setShowResults(text.trim().length >= 3);
    if (text.trim().length > 0) setSelectedRestaurant(null);
  }, []);

  const handleSearchFocus = useCallback(() => {
    if (searchQuery.trim().length >= 3) setShowResults(true);
  }, [searchQuery]);

  const handleClear = useCallback(() => {
    Keyboard.dismiss();
    searchBarRef.current?.blur();
    setSearchQuery("");
    setShowResults(false);
  }, []);

  const recenterBottom = insets.bottom + (selectedRestaurant ? 170 : 32);

  // ── Rendu ────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={FALLBACK_STYLE}
        compass={true}
        logo={false}
        attribution={true}
        attributionPosition={{ bottom: 8, left: 8 }}
        onRegionIsChanging={handleScaleUpdate}
        onRegionDidChange={handleRegionChange}
        onPress={handleMapPress}
      >
        {/* Caméra v11 : API impérative via ref — initialViewState = Bruxelles par défaut */}
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [4.3517, 50.8503], zoom: 12 }}
        />

        <UserLocation animated={false} />

        <GeoJSONSource
          id="restaurants"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={displayGeoJSON as any}
        >
          {/*
            Affichage progressif style Google Maps :
            - Les restaurants sont triés par score dans le GeoJSON (rank 1 = meilleur)
            - Le filtre MapLibre n'affiche que les rank ≤ seuil selon le zoom
            - ["step", ["zoom"], défaut, z1, val1, z2, val2, ...]
              zoom < 11  → top 5   (vue ville)
              zoom 11-12 → top 15  (vue quartier)
              zoom 12-13 → top 40
              zoom 13-14 → top 80
              zoom ≥ 14  → tout
          */}
          <Layer
            type="circle"
            id="restaurant-points"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter={[
              "<=",
              ["get", "rank"],
              ["step", ["zoom"], 5, 11, 15, 12, 40, 13, 80, 14, 10000],
            ] as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            paint={{
              "circle-color": CATEGORY_COLOR_EXPRESSION as any,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "popularity_score"], 0],
                0, 5, 50, 7, 100, 9,
              ] as any,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 1.5,
              "circle-opacity": selectedRestaurant ? 0.3 : 0.9,
            }}
          />
        </GeoJSONSource>

        {/* Marqueur sélectionné — rendu natif via ViewAnnotation */}
        {selectedRestaurant && (() => {
          const cfg = getCategoryConfig(selectedRestaurant.category);
          return (
            <ViewAnnotation
              lngLat={[selectedRestaurant.longitude, selectedRestaurant.latitude]}
              anchor="bottom"
            >
              <View style={styles.markerContainer}>
                <View style={[styles.markerCircle, { backgroundColor: cfg.color }]}>
                  <Text style={styles.markerEmoji}>{cfg.emoji}</Text>
                </View>
                <View style={[styles.markerTail, { borderTopColor: cfg.color }]} />
              </View>
            </ViewAnnotation>
          );
        })()}
      </Map>


      {/* Overlay recherche — masqué en état full de la bottom sheet */}
      {searchVisible && (
        <View
          style={[styles.searchOverlay, { top: insets.top + 8, pointerEvents: "box-none" }]}
        >
          <SearchBar
            ref={searchBarRef}
            value={searchQuery}
            onChangeText={handleQueryChange}
            onFocus={handleSearchFocus}
            onClear={handleClear}
            isLoading={isSearchLoading}
          />
          {showResults && (
            <SearchResults
              localResults={localResults}
              isLoading={isSearchLoading}
              onSelectLocal={handleSelectLocal}
            />
          )}
        </View>
      )}

      {/* Filtres catégories — masqués en état mid et full de la bottom sheet */}
      {filtersVisible && !showResults && (
        <View
          style={[styles.filterOverlay, { top: insets.top + 64, pointerEvents: "box-none" }]}
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
      {showZoomHint && !showResults && (
        <View style={[styles.zoomHint, { pointerEvents: "none" }]}>
          <Text style={styles.zoomHintText}>Zoomez pour voir les restaurants</Text>
        </View>
      )}

      {!showResults && !selectedRestaurant && (
        <Pressable
          style={[styles.recenterBtn, { bottom: recenterBottom }]}
          onPress={handleRecenter}
        >
          <Ionicons name="locate" size={22} color="#E8472A" />
        </Pressable>
      )}

      {/* Preview restaurant au tap */}
      {selectedRestaurant && (
        <RestaurantPreviewCard
          restaurant={selectedRestaurant}
          onClose={() => {
            isRestaurantSelectedRef.current = false;
            setSelectedRestaurant(null);
            // Restaure les overlays masqués par la bottom sheet
            setFiltersVisible(true);
            setSearchVisible(true);
          }}
          bottomInset={insets.bottom}
          onMidExpand={() => {
            setFiltersVisible(false);
          }}
          onFullExpand={() => {
            setFiltersVisible(false);
            setSearchVisible(false);
          }}
          onCollapse={() => {
            setFiltersVisible(true);
            setSearchVisible(true);
          }}
        />
      )}

      {/* Échelle de carte */}
      {!selectedRestaurant && <View
        style={[styles.scaleBarWrapper, { bottom: 24 + insets.bottom, left: 16 }]}
        pointerEvents="none"
      >
        <View style={{ flexDirection: "row", alignItems: "center", width: scaleBar.width }}>
          <View style={styles.scaleBarTick} />
          <View style={styles.scaleBarLine} />
          <View style={styles.scaleBarTick} />
        </View>
        <Text style={styles.scaleBarLabel}>{scaleBar.label}</Text>
      </View>}

      {/* Overlay localisation — masqué dès que la position est obtenue */}
      {locationLoading && (
        <View style={styles.locationOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#E8472A" />
          <Text style={styles.locationOverlayText}>Localisation en cours…</Text>
        </View>
      )}

      {/* Toast */}
      <Animated.View
        style={[
          styles.toast,
          { opacity: toastOpacity, bottom: insets.bottom + 32, pointerEvents: "none" },
        ]}
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

  // ── Overlay localisation ───────────────────────────────────────────────────
  locationOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  locationOverlayText: {
    color: "#555",
    fontSize: 14,
  },

  // ── Recherche ──────────────────────────────────────────────────────────────
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

  // ── Échelle de carte ──────────────────────────────────────────────────────
  scaleBarWrapper: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 4,
    padding: 4,
    alignItems: "flex-start",
    zIndex: 15,
  },
  scaleBarTick: {
    width: 2,
    height: 8,
    backgroundColor: "#333",
  },
  scaleBarLine: {
    flex: 1,
    height: 3,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#333",
  },
  scaleBarLabel: {
    fontSize: 11,
    color: "#333",
    fontWeight: "600",
    marginTop: 2,
  },

  // ── Marqueur sélectionné ──────────────────────────────────────────────────
  markerContainer: {
    alignItems: "center",
  },
  markerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  markerEmoji: {
    fontSize: 20,
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
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
