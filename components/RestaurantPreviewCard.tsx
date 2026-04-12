import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { getCategoryConfig } from "../constants/categories";
import type { Restaurant } from "../hooks/useRestaurants";

type Props = {
  restaurant: Restaurant;
  onClose: () => void;
  bottomInset: number;
};

export default function RestaurantPreviewCard({ restaurant, onClose, bottomInset }: Props) {
  const config = getCategoryConfig(restaurant.category);
  const router = useRouter();
  const translateY = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [translateY]);

  return (
    <Animated.View
      style={[
        styles.card,
        { paddingBottom: 16 + bottomInset, transform: [{ translateY }] },
      ]}
    >
      {/* Nom + bouton fermer */}
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={2}>{restaurant.name}</Text>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {/* Catégorie + score */}
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: config.color + "22" }]}>
          <Text style={[styles.badgeText, { color: config.color }]}>
            {config.emoji} {config.label}
          </Text>
        </View>
        {restaurant.composite_score != null && (
          <Text style={styles.score}>⭐ {restaurant.composite_score.toFixed(1)}</Text>
        )}
      </View>

      {/* Adresse */}
      {!!restaurant.address && (
        <Text style={styles.address} numberOfLines={1}>{restaurant.address}</Text>
      )}

      {/* Avis */}
      {restaurant.review_count > 0 && (
        <Text style={styles.reviews}>{restaurant.review_count} avis</Text>
      )}

      {/* Voir la fiche */}
      <Pressable
        style={[styles.detailBtn, { backgroundColor: config.color }]}
        onPress={() => router.push(`/restaurant/${restaurant.id}`)}
      >
        <Text style={styles.detailBtnText}>Voir la fiche</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
    zIndex: 30,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
    flex: 1,
    marginRight: 12,
    lineHeight: 22,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "700",
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  score: {
    fontSize: 14,
    color: "#E8472A",
    fontWeight: "700",
  },
  address: {
    fontSize: 13,
    color: "#888",
    marginBottom: 4,
  },
  reviews: {
    fontSize: 12,
    color: "#aaa",
    marginBottom: 12,
  },
  detailBtn: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  detailBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
