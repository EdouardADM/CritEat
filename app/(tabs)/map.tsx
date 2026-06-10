import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
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
import { type RestaurantCategory } from "../../constants/categories";
import { restaurantsToGeoJSON } from "../../utils/geo";
import { useFollowingRestaurants } from "../../hooks/useFollowingRestaurants";
import { boundsOf } from "../../hooks/useUserReviewedRestaurants";

type Coords = { latitude: number; longitude: number };

// Fond raster OSM (gratuit, pas de clé API)
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

  // ── Filtres catégories + filtre « Amis » ─────────────────────────────────────
  const [activeCategories, setActiveCategories] = useState<RestaurantCategory[]>([]);
  const [friendsActive, setFriendsActive] = useState(false);

  // ── Visibilité overlay (masqués par la bottom sheet en mid/full) ─────────────
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [searchVisible, setSearchVisible]   = useState(true);

  // ── Fiche restaurant ────────────────────────────────────────────────────────
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  useEffect(() => { selectedRestaurantRef.current = selectedRestaurant; }, [selectedRestaurant]);

  // ── Échelle de carte ────────────────────────────────────────────────────────
  const [scaleBar, setScaleBar] = useState(() => computeScaleBar(12, 50.8503));

  // ── Restaurants (fetch + cache) ──────────────────────────────────────────────
  const { restaurants, loading: restaurantsLoading } = useRestaurants(mapBounds);

  // ── Restaurants notés par mes abonnements (filtre « Amis ») ──────────────────
  const { restaurants: followingRestaurants, loading: followingLoading } =
    useFollowingRestaurants(friendsActive);

  // Source affichée : restos d'amis si le filtre est actif, sinon ceux du viewport.
  const sourceRestaurants = friendsActive ? followingRestaurants : restaurants;

  // ── Recherche (debounce 400ms) ───────────────────────────────────────────────
  const { localResults, isLoading: isSearchLoading } =
    useRestaurantSearch(searchQuery, userCoords);

  // ── Filtrage + conversion GeoJSON ────────────────────────────────────────────
  const visibleRestaurants = useMemo(
    () =>
      activeCategories.length === 0
        ? sourceRestaurants
        : sourceRestaurants.filter((r) =>
            activeCategories.includes(r.category as RestaurantCategory)
          ),
    [sourceRestaurants, activeCategories]
  );

  const restaurantsGeoJSON = useMemo(
    () => restaurantsToGeoJSON(visibleRestaurants),
    [visibleRestaurants]
  );

  // Id du resto sélectionné — alimente la couche de surbrillance (pas de
  // ViewAnnotation : on garde le marqueur dans la source pour qu'il reste tapable
  // et qu'aucun overlay natif ne « fantôme »). "" = aucune sélection.
  const selectedId = selectedRestaurant?.id ?? "";

  // ── Toggle filtre catégorie ──────────────────────────────────────────────────
  const handleToggleCategory = useCallback((category: RestaurantCategory) => {
    setActiveCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }, []);

  // ── Cadrage auto sur les restos d'amis à l'activation du filtre ──────────────
  useEffect(() => {
    if (!friendsActive || followingRestaurants.length === 0) return;
    const b = boundsOf(followingRestaurants);
    if (!b) return;
    const t = setTimeout(() => {
      cameraRef.current?.fitBounds(
        [b[0], b[1], b[2], b[3]],
        { padding: { top: 140, right: 50, bottom: 160, left: 50 }, duration: 600 },
      );
    }, 200);
    return () => clearTimeout(t);
  }, [friendsActive, followingRestaurants]);

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

  // ── Tap sur un restaurant ────────────────────────────────────────────────────
  // Ouvre TOUJOURS l'aperçu du resto tapé (ou bascule vers un autre). On ne ferme
  // jamais ici → évite la bascule open/close qui rendait le tap peu fiable.
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

  // ── Tap sur la carte ─────────────────────────────────────────────────────────
  // v11 : onPress fournit event.nativeEvent.point = [x, y]. On interroge une BOÎTE
  // de pixels autour du doigt (tolérance) pour viser un marqueur plus facilement.
  const handleMapPress = useCallback(async (event: any) => {
    if (showResultsRef.current) {
      Keyboard.dismiss();
      searchBarRef.current?.blur();
      setShowResults(false);
      return;
    }

    const [x, y] = event.nativeEvent.point as [number, number];
    const HIT = 14; // px de tolérance autour du tap
    const box: [[number, number], [number, number]] = [
      [x - HIT, y - HIT],
      [x + HIT, y + HIT],
    ];

    try {
      const features = await mapRef.current?.queryRenderedFeatures(
        box,
        { layers: ["restaurant-points"] }
      );

      if (features && features.length > 0) {
        handleRestaurantPress(features[0]);
        return;
      }
    } catch (e) {
      console.warn("Erreur de détection du clic:", e);
    }

    // Un tap sur le fond de carte ne ferme PAS l'aperçu : on évite ainsi qu'un
    // onPress parasite de MapLibre le referme juste après l'ouverture. La fermeture
    // se fait par le bouton ✕ ou un swipe sur la carte d'aperçu.
  }, [handleRestaurantPress]);

  // ── Recentrer sur l'utilisateur ──────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    if (!userCoords) return;
    moveCameraTo([userCoords.longitude, userCoords.latitude], 14, "flyTo", 500);
  }, [userCoords, moveCameraTo]);


  // ── Sélection résultat local ─────────────────────────────────────────────────
  const handleSelectLocal = useCallback((result: SearchResult) => {
    // 1. Ferme tout d'abord — laisse React re-render sans backdrop
    setShowResults(false);
    setSearchQuery("");
    Keyboard.dismiss();
    ignoreNextQueryChangeRef.current = true;
    setTimeout(() => { ignoreNextQueryChangeRef.current = false; }, 1000);
    searchBarRef.current?.blur();

    // 2. Monte la preview card après que le backdrop est démonté
    setTimeout(() => {
      isRestaurantSelectedRef.current = true;
      setSelectedRestaurant({
        id: result.id,
        place_id: result.place_id,
        name: result.name,
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
    }, 0);

    // 3. Force le fetch des restaurants autour de la nouvelle position
    setTimeout(() => {
      isRestaurantSelectedRef.current = false;
      setMapBounds({
        minLat: result.lat - 0.005,
        minLng: result.lng - 0.008,
        maxLat: result.lat + 0.005,
        maxLng: result.lng + 0.008,
        zoom: 16,
      });
      isRestaurantSelectedRef.current = true;
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

        {/* Point de localisation utilisateur — version agrandie (halo blanc + point bleu) */}
        <UserLocation animated={false}>
          <Layer
            type="circle"
            id="user-loc-halo"
            paint={{
              "circle-radius": 14,
              "circle-color": "#FFFFFF",
              "circle-pitch-alignment": "map",
            } as any}
          />
          <Layer
            type="circle"
            id="user-loc-dot"
            paint={{
              "circle-radius": 9,
              "circle-color": "#1E88E5",
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
              "circle-pitch-alignment": "map",
            } as any}
          />
        </UserLocation>

        <GeoJSONSource
          id="restaurants"
          data={restaurantsGeoJSON as any}
        >
          {/*
            Affichage progressif style Google Maps :
            - Les restaurants sont triés par score dans le GeoJSON (rank 1 = meilleur)
            - Le filtre MapLibre n'affiche que les rank ≤ seuil selon le zoom
            - ["step", ["zoom"], défaut, z1, val1, z2, val2, ...]
            - Seuils réduits ~1,5× pour désencombrer la carte :
              zoom < 11  → top 3   (vue ville)
              zoom 11-12 → top 10  (vue quartier)
              zoom 12-13 → top 27
              zoom 13-14 → top 53
              zoom ≥ 14  → tout
          */}
          <Layer
            type="circle"
            id="restaurant-points"
            filter={[
              "<=",
              ["get", "rank"],
              ["step", ["zoom"], 3, 11, 10, 12, 27, 13, 53, 14, 10000],
            ] as any}
            paint={{
              "circle-color": CATEGORY_COLOR_EXPRESSION as any,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "popularity_score"], 0],
                0, 7, 50, 9, 100, 12,
              ] as any,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
              "circle-opacity": selectedRestaurant ? 0.45 : 0.9,
            }}
          />

          {/* Surbrillance du resto sélectionné — dans la couche (pas d'overlay natif) */}
          <Layer
            type="circle"
            id="restaurant-selected"
            filter={["==", ["get", "id"], selectedId] as any}
            paint={{
              "circle-color": CATEGORY_COLOR_EXPRESSION as any,
              "circle-radius": 15,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 3,
            }}
          />
        </GeoJSONSource>
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
            friendsActive={friendsActive}
            onToggleFriends={() => setFriendsActive((v) => !v)}
          />
        </View>
      )}

      {/* Badge chargement restaurants */}
      {(restaurantsLoading || (friendsActive && followingLoading)) && !showResults && (
        <View style={[styles.loadingBadge, { top: insets.top + 68 }]}>
          <ActivityIndicator size="small" color="#E8472A" />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      )}

      {/* Filtre Amis actif mais aucun resto noté par les abonnements */}
      {friendsActive && !followingLoading && followingRestaurants.length === 0 && !showResults && (
        <View style={[styles.zoomHint, { pointerEvents: "none" }]}>
          <Text style={styles.zoomHintText}>Aucun resto noté par tes abonnements</Text>
        </View>
      )}

      {/* Invitation à zoomer (désactivée en mode Amis) */}
      {showZoomHint && !friendsActive && !showResults && (
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
});
