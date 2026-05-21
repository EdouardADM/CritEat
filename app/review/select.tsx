import { useCallback, useEffect, useState } from "react";
import {
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
  type SearchResult,
} from "../../hooks/useRestaurantSearch";
import { supabase } from "../../lib/supabase";
import { checkDistanceToRestaurant, type DistanceCheckResult } from "../../hooks/useDistanceCheck";
import DistanceGateModal from "../../components/review/DistanceGateModal";

type UserCoords = { latitude: number; longitude: number };

export default function SelectRestaurantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);

  // ── Gate de distance ───────────────────────────────────────────────────────
  const [gateVisible, setGateVisible]       = useState(false);
  const [gateChecking, setGateChecking]     = useState(false);
  const [gateResult, setGateResult]         = useState<DistanceCheckResult | null>(null);
  const [gateRetryCount, setGateRetryCount] = useState(0);
  const [gatePendingResult, setGatePendingResult] = useState<SearchResult | null>(null);

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

  const { localResults, isLoading } = useRestaurantSearch(
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

  const runSelectGateCheck = useCallback(
    async (result: SearchResult, retryCount: number) => {
      setGatePendingResult(result);
      setGateChecking(true);
      setGateVisible(true);
      const check = await checkDistanceToRestaurant(result.lat, result.lng);
      setGateChecking(false);
      if (check.status === "in_range") {
        setGateVisible(false);
        setGateResult(null);
        setGatePendingResult(null);
        const distParam = check.distance_m != null ? `&gateDist=${check.distance_m}` : "";
        const accParam  = check.accuracy_m  != null ? `&gateAcc=${check.accuracy_m}`  : "";
        router.push(
          `/review/${result.id}?name=${encodeURIComponent(result.name)}&lat=${result.lat}&lng=${result.lng}${distParam}${accParam}` as any,
        );
      } else {
        setGateResult(check);
        setGateRetryCount(retryCount);
      }
    },
    [router],
  );

  // Résultat local → id + coordonnées disponibles directement
  const handleSelectLocal = useCallback(
    (result: SearchResult) => {
      void runSelectGateCheck(result, 0);
    },
    [runSelectGateCheck],
  );

  const handleGateRetry = useCallback(() => {
    if (!gatePendingResult) return;
    const next = gateRetryCount + 1;
    void runSelectGateCheck(gatePendingResult, next);
  }, [gatePendingResult, gateRetryCount, runSelectGateCheck]);

  // Résultat Google → upsert si nécessaire, puis récupère l'id DB
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
            userLocation={userCoords}
            isLoading={isLoading}
            onSelectLocal={handleSelectLocal}
          />
        )}

        {!showResults && (
          <Text style={styles.hint}>
            Tapez au moins 3 caractères pour rechercher
          </Text>
        )}
      </View>


      {/* ── Gate de distance ──────────────────────────────────────────────── */}
      <DistanceGateModal
        visible={gateVisible}
        result={gateResult}
        restaurantName={gatePendingResult?.name ?? ""}
        onRetry={handleGateRetry}
        onClose={() => { setGateVisible(false); setGateResult(null); setGatePendingResult(null); }}
        retryCount={gateRetryCount}
        checking={gateChecking}
      />
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
});
