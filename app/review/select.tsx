import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

import SearchBar from "../../components/SearchBar";
import SearchResults from "../../components/SearchResults";
import {
  useRestaurantSearch,
  type MappedGoogleResult,
  type SearchResult,
} from "../../hooks/useRestaurantSearch";
import { supabase } from "../../lib/supabase";

type UserCoords = { latitude: number; longitude: number };

export default function SelectRestaurantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [upserting, setUpserting] = useState(false);

  // Dernière position connue pour afficher les distances (non bloquant)
  useEffect(() => {
    Location.getLastKnownPositionAsync()
      .then((pos) => {
        if (pos) {
          setUserCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      })
      .catch(() => {});
  }, []);

  const { localResults, googleResults, isLoading } = useRestaurantSearch(
    query,
    userCoords
  );

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setShowResults(text.trim().length >= 3);
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
    setShowResults(false);
  }, []);

  // Résultat local → id + coordonnées disponibles directement
  const handleSelectLocal = useCallback(
    (result: SearchResult) => {
      router.push(
        `/review/${result.id}?name=${encodeURIComponent(result.name)}&lat=${result.latitude}&lng=${result.longitude}`
      );
    },
    [router]
  );

  // Résultat Google → upsert si nécessaire, puis récupère l'id DB
  const handleSelectGoogle = useCallback(
    async (result: MappedGoogleResult) => {
      setUpserting(true);
      try {
        // Cherche un doublon existant
        const { data: dupData } = await supabase.rpc(
          "find_duplicate_restaurant",
          {
            search_name: result.name,
            search_lat: result.latitude,
            search_lng: result.longitude,
          }
        );
        const dup = (
          dupData as { id: string; name: string; place_id: string }[] | null
        )?.[0];

        if (dup) {
          router.push(
            `/review/${dup.id}?name=${encodeURIComponent(dup.name)}&lat=${result.latitude}&lng=${result.longitude}`
          );
          return;
        }

        // Insère le restaurant Google en DB
        await supabase.rpc("batch_upsert_restaurants", {
          restaurants: [
            {
              place_id: result.place_id,
              name: result.name,
              category: result.category,
              address: result.address,
              city: result.city,
              postcode: result.postcode,
              latitude: result.latitude,
              longitude: result.longitude,
              phone: result.phone,
              website: result.website,
              opening_hours: result.opening_hours,
              description: null,
              takeaway: null,
              delivery: null,
              outdoor_seating: null,
              wheelchair: null,
              diet_options: null,
              source: "google",
            },
          ],
        });

        // Récupère l'id assigné
        const { data: newRow } = await supabase
          .from("restaurants")
          .select("id, name")
          .eq("place_id", result.place_id)
          .single();

        if (newRow) {
          router.push(
            `/review/${newRow.id}?name=${encodeURIComponent(newRow.name)}&lat=${result.latitude}&lng=${result.longitude}`
          );
        }
      } catch {
        // Dégradation silencieuse — le flow est annulé, l'utilisateur
        // peut relancer la recherche
      } finally {
        setUpserting(false);
      }
    },
    [router]
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={24} color="#1a1a1a" />
        </Pressable>
        <Text style={styles.title}>Quel restaurant ?</Text>
        {/* Spacer symétrique pour centrer le titre */}
        <View style={styles.closeBtn} />
      </View>

      {/* Contenu */}
      <View style={styles.body}>
        <SearchBar
          value={query}
          onChangeText={handleQueryChange}
          onClear={handleClear}
          isLoading={isLoading}
        />

        {showResults && (
          <SearchResults
            localResults={localResults}
            googleResults={googleResults}
            userLocation={userCoords}
            isLoading={isLoading}
            onSelectLocal={handleSelectLocal}
            onSelectGoogle={handleSelectGoogle}
          />
        )}

        {!showResults && (
          <Text style={styles.hint}>
            Tapez au moins 3 caractères pour rechercher
          </Text>
        )}
      </View>

      {/* Overlay pendant l'upsert Google */}
      {upserting && (
        <View style={styles.upsertOverlay}>
          <ActivityIndicator size="large" color="#E8472A" />
          <Text style={styles.upsertText}>Chargement…</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5E5",
  },
  closeBtn: {
    width: 36,
    alignItems: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
  },

  // ── Body ─────────────────────────────────────────────────────────────────────
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  hint: {
    marginTop: 32,
    textAlign: "center",
    fontSize: 14,
    color: "#aaa",
  },

  // ── Overlay upsert ───────────────────────────────────────────────────────────
  upsertOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  upsertText: {
    fontSize: 14,
    color: "#555",
  },
});
