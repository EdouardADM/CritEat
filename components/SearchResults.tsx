import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getCategoryConfig } from "../constants/categories";
import type { MappedGoogleResult, SearchResult } from "../hooks/useRestaurantSearch";

// ─── Distance ─────────────────────────────────────────────────────────────────

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type UserLocation = { latitude: number; longitude: number };

type Props = {
  localResults: SearchResult[];
  googleResults: MappedGoogleResult[];
  userLocation: UserLocation | null;
  isLoading: boolean;
  onSelectLocal: (result: SearchResult) => void;
  onSelectGoogle: (result: MappedGoogleResult) => void;
};

// ─── Row ──────────────────────────────────────────────────────────────────────

function ResultRow({
  name,
  category,
  address,
  latitude,
  longitude,
  userLocation,
  isGoogle,
  onPress,
}: {
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  userLocation: UserLocation | null;
  isGoogle: boolean;
  onPress: () => void;
}) {
  const config = getCategoryConfig(category);
  const dist =
    userLocation != null
      ? formatDist(
          haversineMeters(
            userLocation.latitude,
            userLocation.longitude,
            latitude,
            longitude,
          ),
        )
      : null;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.badges}>
          {isGoogle && (
            <View style={styles.googleBadge}>
              <Text style={styles.googleBadgeText}>Google</Text>
            </View>
          )}
          <View style={[styles.catBadge, { backgroundColor: config.color + "22" }]}>
            <Text style={[styles.catBadgeText, { color: config.color }]}>
              {config.emoji} {config.label}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.rowBottom}>
        <Text style={styles.address} numberOfLines={1}>
          {address}
        </Text>
        {dist != null && <Text style={styles.dist}>{dist}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchResults({
  localResults,
  googleResults,
  userLocation,
  isLoading,
  onSelectLocal,
  onSelectGoogle,
}: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 130,
      friction: 9,
    }).start();
  }, [anim]);

  const animStyle = {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
  };

  const isEmpty =
    !isLoading && localResults.length === 0 && googleResults.length === 0;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Recherche en cours */}
        {isLoading && localResults.length === 0 && googleResults.length === 0 && (
          <View style={styles.stateRow}>
            <ActivityIndicator size="small" color="#E8472A" />
            <Text style={styles.stateText}>Recherche en cours…</Text>
          </View>
        )}

        {/* Aucun résultat */}
        {isEmpty && (
          <View style={styles.stateRow}>
            <Text style={styles.stateText}>Aucun restaurant trouvé</Text>
          </View>
        )}

        {/* Résultats locaux */}
        {localResults.map((r) => (
          <ResultRow
            key={r.place_id}
            name={r.name}
            category={r.category}
            address={r.address || r.city}
            latitude={r.latitude}
            longitude={r.longitude}
            userLocation={userLocation}
            isGoogle={false}
            onPress={() => onSelectLocal(r)}
          />
        ))}

        {/* Séparateur Google */}
        {googleResults.length > 0 && (
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>Résultats Google</Text>
            <View style={styles.dividerLine} />
          </View>
        )}

        {/* Résultats Google */}
        {googleResults.map((r) => (
          <ResultRow
            key={r.place_id}
            name={r.name}
            category={r.category}
            address={r.address}
            latitude={r.latitude}
            longitude={r.longitude}
            userLocation={userLocation}
            isGoogle={true}
            onPress={() => onSelectGoogle(r)}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    maxHeight: 360,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 6,
  },
  scroll: {
    flexGrow: 0,
  },
  // États vides / chargement
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  stateText: {
    fontSize: 14,
    color: "#999",
  },
  // Ligne résultat
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
    gap: 4,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  address: {
    flex: 1,
    fontSize: 12,
    color: "#888",
  },
  dist: {
    fontSize: 12,
    color: "#bbb",
    marginLeft: 6,
    flexShrink: 0,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  catBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  googleBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "#4285F422",
  },
  googleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4285F4",
  },
  // Séparateur Google
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e0e0e0",
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
