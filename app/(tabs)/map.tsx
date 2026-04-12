import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { type RestaurantCategory, getCategoryConfig } from "../../constants/categories";
import { restaurantsToGeoJSON } from "../../utils/geo";

type Coords = { latitude: number; longitude: number };

// Position cible de la caméra. Quand null → caméra libre (aucune ancre native).
type CameraTarget = {
  center: [number, number];
  zoom: number;
  animationMode: "flyTo" | "easeTo" | "none";
  animationDuration: number;
  triggerKey: string;
};

// Délai après la fin d'une animation caméra avant de relâcher l'ancre native.
// MapLibre a besoin d'un court buffer pour que le geste natif soit bien terminé.
const CAMERA_RELEASE_BUFFER_MS = 150;

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
  const mapRef = useRef<MapLibreGL.MapView>(null);
  const cameraRef = useRef<MapLibreGL.Camera>(null);

  const isRestaurantSelectedRef = useRef(false);
  const selectedRestaurantRef = useRef<Restaurant | null>(null);
  const showResultsRef = useRef(false);

  // ── GPS ─────────────────────────────────────────────────────────────────────
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  // ── Carte ───────────────────────────────────────────────────────────────────
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  // currentZoom est un ref (pas state) pour éviter les re-renders à chaque pan/zoom.
  // Un re-render sur chaque mouvement ferait re-évaluer les props du Camera, ce qui
  // pousse un update bridge natif et ré-applique la dernière cible setCamera (snap).
  const currentZoomRef = useRef(13);
  // Booléen d'état uniquement pour afficher/masquer le hint de zoom (change rarement)
  const [showZoomHint, setShowZoomHint] = useState(false);
  // ── Caméra contrôlée ─────────────────────────────────────────────────────────
  // null = caméra libre (pas d'ancre native). Valeur = animation en cours.
  // On NE PAS utiliser cameraRef.setCamera() directement : il établit une ancre
  // native persistante qui fait snapper la carte après chaque pan.
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const cameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // GeoJSON affiché dans le ShapeSource : exclut le restaurant sélectionné
  // (il est rendu en surbrillance via MarkerView)
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

  // ── Mise à jour bounds quand la carte se déplace ─────────────────────────────
  // L'event fournit déjà zoomLevel et visibleBounds — pas d'appels bridge async.
  // On n'utilise PAS setCurrentZoom(state) ici : chaque re-render pousse un update
  // bridge au Camera natif qui ré-applique sa dernière cible setCamera → snap.
  // On met à jour seulement le ref + un booléen qui change rarement (hint zoom).
  // ── Mise à jour de l'échelle en temps réel (pendant le geste) ───────────────
  const handleScaleUpdate = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (feature: any) => {
      const { zoomLevel, visibleBounds } = feature.properties as {
        zoomLevel: number;
        visibleBounds: [[number, number], [number, number]];
      };
      const [ne, sw] = visibleBounds;
      requestAnimationFrame(() => {
        setScaleBar(computeScaleBar(zoomLevel, (ne[1] + sw[1]) / 2));
      });
    },
    []
  );

  const handleRegionChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (feature: any) => {
      const { zoomLevel, visibleBounds } = feature.properties as {
        zoomLevel: number;
        visibleBounds: [[number, number], [number, number]];
      };
      const [ne, sw] = visibleBounds;
      const roundedZoom = Math.round(zoomLevel);
      currentZoomRef.current = roundedZoom;
      // Re-render uniquement si on franchit le seuil du hint (< 10)
      setShowZoomHint(prev => {
        const hint = roundedZoom < 10;
        return prev === hint ? prev : hint;
      });
      // Échelle : mise à jour finale (sync avec les bounds)
      setScaleBar(computeScaleBar(zoomLevel, (ne[1] + sw[1]) / 2));
      if (isRestaurantSelectedRef.current) return;
      setMapBounds({
        minLat: sw[1],
        minLng: sw[0],
        maxLat: ne[1],
        maxLng: ne[0],
        zoom: roundedZoom,
      });
    },
    []
  );

  // ── Navigation caméra (props contrôlées, sans ancre native) ─────────────────
  const moveCameraTo = useCallback((
    center: [number, number],
    zoom: number,
    animationMode: CameraTarget["animationMode"] = "flyTo",
    animationDuration = 400,
  ) => {
    if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
    setCameraTarget({
      center, zoom, animationMode, animationDuration,
      triggerKey: String(Date.now()),
    });
    // Après la fin de l'animation, on remet null → centerCoordinate = undefined
    // → MapLibre n'a plus d'ancre → l'utilisateur peut naviguer librement.
    cameraTimerRef.current = setTimeout(
      () => setCameraTarget(null),
      animationDuration + CAMERA_RELEASE_BUFFER_MS,
    );
  }, []);

  // Cleanup du timer caméra au démontage du composant
  useEffect(() => () => {
    if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
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

  // ── Tap sur un point ou cluster dans le ShapeSource ──────────────────────────
  const handleRestaurantPress = useCallback((feature: any) => {
    if (!feature) return;

    if (feature.properties?.point_count) {
      // ✅ LOGIQUE CLUSTER
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      moveCameraTo([lng, lat], currentZoomRef.current + 2, "easeTo", 500);
    } else {
      // ✅ LOGIQUE RESTAURANT
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
    }
  }, [moveCameraTo]);

  // ── Tap sur le fond de carte → ferme la fiche ────────────────────────────────
  // Utilise des refs pour éviter tout re-bind de onPress sur MapView (causerait
  // un reset des gesture recognizers MapLibre et bloquerait la navigation).
  const handleMapPress = useCallback(async (event: any) => {
    if (showResultsRef.current) return;

    const { screenPointX, screenPointY } = event.properties;

    try {
      const featureCollection = await mapRef.current?.queryRenderedFeaturesAtPoint(
        [screenPointX, screenPointY],
        undefined,
        ["clusters", "restaurant-points"]
      );

      if (featureCollection && featureCollection.features.length > 0) {
        handleRestaurantPress(featureCollection.features[0]);
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
  const dismissSearch = useCallback(() => setShowResults(false), []);

  // ── Sélection résultat local ─────────────────────────────────────────────────
  const handleSelectLocal = useCallback((result: SearchResult) => {
    setShowResults(false);
    setSearchQuery("");
    moveCameraTo([result.longitude, result.latitude], 16, "flyTo", 400);
  }, [moveCameraTo]);

  // ── Sélection résultat Google ────────────────────────────────────────────────
  const handleSelectGoogle = useCallback(
    (result: MappedGoogleResult) => {
      setShowResults(false);
      setSearchQuery("");
      moveCameraTo([result.longitude, result.latitude], 16, "flyTo", 400);

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
    [showToast, moveCameraTo]
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

  // defaultSettings mémoïsé : prop stable → le Camera natif ne reçoit pas de bridge
  // update à chaque re-render → MapLibre ne ré-applique plus sa dernière cible setCamera.
  // Doit être AVANT les early returns pour respecter les Rules of Hooks.
  // Bruxelles par défaut — la caméra sera déplacée par moveCameraTo dès que le GPS répond
  const cameraDefaultSettings = useMemo(
    () => ({
      centerCoordinate: [4.3517, 50.8503] as [number, number],
      zoomLevel: 12,
    }),
    []
  );

  const recenterBottom = insets.bottom + (selectedRestaurant ? 170 : 32);

  // ── Rendu ────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={FALLBACK_STYLE}
        compassEnabled={true}
        logoEnabled={false}
        attributionEnabled={true}
        attributionPosition={{ bottom: 8, left: 8 }}
        onRegionIsChanging={handleScaleUpdate}
        onRegionDidChange={handleRegionChange}
        onPress={handleMapPress}
      >
        {/*
          Props contrôlées : quand cameraTarget est null, centerCoordinate est
          undefined → MapLibre n'a pas d'ancre native → navigation libre.
          Quand cameraTarget est défini, triggerKey change → animation déclenchée
          une seule fois. Après animationDuration+150ms, cameraTarget repasse à
          null → caméra libre.
        */}
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={cameraDefaultSettings}
          centerCoordinate={cameraTarget?.center}
          zoomLevel={cameraTarget?.zoom}
          animationMode={cameraTarget?.animationMode}
          animationDuration={cameraTarget?.animationDuration}
          triggerKey={cameraTarget?.triggerKey}
        />

        <MapLibreGL.UserLocation visible={true} animated={false} />

        <MapLibreGL.ShapeSource
          id="restaurants"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          shape={displayGeoJSON as any}
          cluster={true}
          clusterRadius={50}
          clusterMaxZoomLevel={14}
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
              circleOpacity: selectedRestaurant ? 0.3 : 0.85,
              circleStrokeColor: "#FFFFFF",
              circleStrokeWidth: 2,
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
              circleOpacity: selectedRestaurant ? 0.3 : 0.9,
            }}
          />
        </MapLibreGL.ShapeSource>

        {/* Marqueur sélectionné — rendu natif via MarkerView */}
        {selectedRestaurant && (() => {
          const cfg = getCategoryConfig(selectedRestaurant.category);
          return (
            <MapLibreGL.MarkerView
              coordinate={[selectedRestaurant.longitude, selectedRestaurant.latitude]}
            >
              <View style={styles.markerContainer}>
                <View style={[styles.markerCircle, { backgroundColor: cfg.color }]}>
                  <Text style={styles.markerEmoji}>{cfg.emoji}</Text>
                </View>
                <View style={[styles.markerTail, { borderTopColor: cfg.color }]} />
              </View>
            </MapLibreGL.MarkerView>
          );
        })()}
      </MapLibreGL.MapView>

      {/* Backdrop : ferme la liste quand on tape la carte */}
      {showResults && searchVisible && (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={dismissSearch}
        />
      )}

      {/* Overlay recherche — masqué en état full de la bottom sheet */}
      {searchVisible && (
        <View
          style={[styles.searchOverlay, { top: insets.top + 8, pointerEvents: "box-none" }]}
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
      <View
        style={[styles.scaleBarWrapper, { bottom: 24 + insets.bottom, left: 16 }]}
        pointerEvents="none"
      >
        <View style={{ flexDirection: "row", alignItems: "center", width: scaleBar.width }}>
          <View style={styles.scaleBarTick} />
          <View style={styles.scaleBarLine} />
          <View style={styles.scaleBarTick} />
        </View>
        <Text style={styles.scaleBarLabel}>{scaleBar.label}</Text>
      </View>

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
