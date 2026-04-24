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
import type { SearchResult } from "../hooks/useRestaurantSearch";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  localResults: SearchResult[];
  isLoading: boolean;
  onSelectLocal: (result: SearchResult) => void;
};

// ─── Row ──────────────────────────────────────────────────────────────────────

function ResultRow({
  name,
  category,
  address,
  onPress,
}: {
  name: string;
  category: string;
  address: string;
  onPress: () => void;
}) {
  const config = getCategoryConfig(category);

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
        <View style={[styles.catBadge, { backgroundColor: config.color + "22" }]}>
          <Text style={[styles.catBadgeText, { color: config.color }]}>
            {config.emoji} {config.label}
          </Text>
        </View>
      </View>

      <Text style={styles.address} numberOfLines={1}>
        {address}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchResults({
  localResults,
  isLoading,
  onSelectLocal,
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

  const isEmpty = !isLoading && localResults.length === 0;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Recherche en cours */}
        {isLoading && localResults.length === 0 && (
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
            onPress={() => onSelectLocal(r)}
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
  catBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
