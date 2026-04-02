import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
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
import { getCategoryConfig } from "../constants/categories";

type Coords = { latitude: number; longitude: number };

// Convertit un zoomLevel MapLibre en latitudeDelta react-native-maps
function zoomToLatDelta(zoomLevel: number): number {
  return 360 / Math.pow(2, zoomLevel);
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

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
  const handleRegionChange = useCallback((region: Region) => {
    const zoom = Math.round(Math.log2(360 / region.latitudeDelta));
    setCurrentZoom(zoom);
    setMapBounds({
      minLat: region.latitude - region.latitudeDelta / 2,
      maxLat: region.latitude + region.latitudeDelta / 2,
      minLng: region.longitude - region.longitudeDelta / 2,
      maxLng: region.longitude + region.longitudeDelta / 2,
      zoom,
    });
  }, []);

  // ── Tap sur un marqueur restaurant ──────────────────────────────────────────
  const handleMarkerPress = useCallback((restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
    setShowResults(false);
  }, []);

  // ── Recentrer sur l'utilisateur ──────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    if (!userCoords) return;
    const delta = zoomToLatDelta(14);
    mapRef.current?.animateToRegion({
      latitude: userCoords.latitude,
      longitude: userCoords.longitude,
      latitudeDelta: delta,
      longitudeDelta: delta,
    }, 500);
  }, [userCoords]);

  // ── Fermer la recherche ──────────────────────────────────────────────────────
  const dismissSearch = useCallback(() => setShowResults(false), []);

  // ── Sélection résultat local ─────────────────────────────────────────────────
  const handleSelectLocal = useCallback((result: SearchResult) => {
    setShowResults(false);
    setSearchQuery("");
    const delta = zoomToLatDelta(16);
    mapRef.current?.animateToRegion({
      latitude: result.latitude,
      longitude: result.longitude,
      latitudeDelta: delta,
      longitudeDelta: delta,
    }, 400);
  }, []);

  // ── Sélection résultat Google ────────────────────────────────────────────────
  const handleSelectGoogle = useCallback((result: MappedGoogleResult) => {
    setShowResults(false);
    setSearchQuery("");
    const delta = zoomToLatDelta(16);
    mapRef.current?.animateToRegion({
      latitude: result.latitude,
      longitude: result.longitude,
      latitudeDelta: delta,
      longitudeDelta: delta,
    }, 400);

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
  const initialDelta = zoomToLatDelta(13);

  // ── Rendu ────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        initialRegion={{
          latitude: userCoords.latitude,
          longitude: userCoords.longitude,
          latitudeDelta: initialDelta,
          longitudeDelta: initialDelta,
        }}
        onRegionChangeComplete={handleRegionChange}
      >
        {restaurants.map((restaurant) => {
          const color = getCategoryConfig(restaurant.category).color;
          return (
            <Marker
              key={restaurant.id}
              coordinate={{ latitude: restaurant.latitude, longitude: restaurant.longitude }}
              onPress={() => handleMarkerPress(restaurant)}
              tracksViewChanges={false}
            >
              <View style={[styles.markerDot, { backgroundColor: color }]} />
            </Marker>
          );
        })}
      </MapView>

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

  // ── Marqueur ───────────────────────────────────────────────────────────────
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#FFFFFF",
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
