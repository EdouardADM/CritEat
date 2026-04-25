import { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { getCategoryConfig } from "../constants/categories";
import type { Restaurant } from "../hooks/useRestaurants";
import { useRestaurantDetail, type ReviewDetail } from "../hooks/useRestaurantDetail";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short",
  });
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function ScoreStars({ value }: { value: number | null }) {
  if (value == null) return <Text style={styles.scoreNA}>—</Text>;
  const full = Math.round(value);
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? "star" : "star-outline"}
          size={10}
          color={i < full ? "#E8472A" : "#ddd"}
          style={{ marginRight: 1 }}
        />
      ))}
    </View>
  );
}

function ReviewPreview({ review, accentColor }: { review: ReviewDetail; accentColor: string }) {
  const initials = review.username
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <View style={styles.reviewPreview}>
      {/* Avatar + username + date */}
      <View style={styles.reviewMeta}>
        <View style={[styles.avatar, { backgroundColor: accentColor + "20" }]}>
          <Text style={[styles.avatarText, { color: accentColor }]}>{initials}</Text>
        </View>
        <Text style={styles.reviewUsername}>{review.username}</Text>
        {review.is_verified && (
          <Ionicons name="checkmark-circle" size={11} color="#16A34A" />
        )}
        <Text style={styles.reviewDot}>·</Text>
        <Text style={styles.reviewDate}>{formatDateShort(review.created_at)}</Text>
      </View>

      {/* Commentaire tronqué */}
      {!!review.comment && (
        <Text style={styles.reviewComment} numberOfLines={1}>
          "{review.comment}"
        </Text>
      )}

      {/* 4 dimensions */}
      <View style={styles.dimRow}>
        {([
          { label: "QP",       value: review.score_qp },
          { label: "Ambiance", value: review.score_ambiance },
          { label: "Service",  value: review.score_service },
          { label: "Plat",     value: review.score_food },
        ] as const).map((d) => (
          <View key={d.label} style={styles.dim}>
            <ScoreStars value={d.value} />
            <Text style={styles.dimLabel}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

type Props = {
  restaurant: Restaurant;
  onClose: () => void;
  bottomInset: number;
};

export default function RestaurantPreviewCard({
  restaurant,
  onClose,
  bottomInset,
}: Props) {
  const router = useRouter();
  const config = getCategoryConfig(restaurant.category);

  const { reviews, loading } = useRestaurantDetail(restaurant.id);
  const latestReview = reviews[0] ?? null;

  // ── Animations ───────────────────────────────────────────────────────────
  const translateY = useRef(new Animated.Value(300)).current;
  const slideX     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [translateY]);

  // Retour sur la map après navigation → remet la card en position peek
  useFocusEffect(
    useCallback(() => {
      translateY.setValue(0);
    }, [translateY])
  );

  // ── Refs pour éviter stale closures ──────────────────────────────────────
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const routerRef = useRef(router);
  routerRef.current = router;
  const restaurantIdRef = useRef(restaurant.id);
  restaurantIdRef.current = restaurant.id;

  // ── PanResponder vertical ─────────────────────────────────────────────────
  // Swipe up (dy < -50 ou vy < -0.5) → navigate vers la fiche plein écran
  // Swipe down (dy > 80 ou vy > 0.5) → ferme
  // Sinon → spring back à 0
  // Pendant le drag : la card suit le doigt (translateY borné à [-30, +400])
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 5,
      onPanResponderMove: (_, { dy }) => {
        const clamped = Math.min(Math.max(dy, -30), 400);
        translateY.setValue(clamped);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy < -50 || vy < -0.5) {
          // Swipe up → navigate
          Animated.timing(translateY, {
            toValue: -400,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            routerRef.current.push(`/restaurant/${restaurantIdRef.current}`);
          });
        } else if (dy > 80 || vy > 0.5) {
          // Swipe down → ferme
          Animated.timing(translateY, {
            toValue: 600,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onCloseRef.current());
        } else {
          // Spring back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  // ── PanResponder horizontal (swipe right → ferme) ────────────────────────
  const swipePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        dx > 30 && Math.abs(dx) > Math.abs(dy),
      onPanResponderRelease: (_, { dx }) => {
        if (dx > 80) {
          Animated.timing(slideX, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onCloseRef.current());
        }
      },
    })
  ).current;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY }, { translateX: slideX }] }]}
    >
      <Animated.View
        {...swipePanResponder.panHandlers}
        style={[styles.card, { paddingBottom: bottomInset }]}
      >
        {/* ── Zone draggable ────────────────────────────────────────────── */}
        <View {...panResponder.panHandlers} style={styles.dragArea}>
          <View style={styles.dragHandle}>
            <View style={styles.dragBar} />
          </View>

          {/* Titre + score global */}
          <View style={styles.headerRow}>
            <Text style={styles.name} numberOfLines={1}>{restaurant.name}</Text>
            {restaurant.composite_score != null && (
              <View style={styles.scorePill}>
                <Ionicons name="star" size={12} color="#E8472A" />
                <Text style={styles.scorePillText}>
                  {restaurant.composite_score.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Info restaurant ──────────────────────────────────────────── */}
        <View style={styles.infoBlock}>
          <View style={[styles.badge, { backgroundColor: config.color + "22" }]}>
            <Text style={[styles.badgeText, { color: config.color }]}>
              {config.emoji} {config.label}
            </Text>
          </View>
          {!!restaurant.address && (
            <Text style={styles.address} numberOfLines={1}>{restaurant.address}</Text>
          )}
        </View>

        {/* ── Séparateur ───────────────────────────────────────────────── */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>Dernier avis</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── Aperçu avis ──────────────────────────────────────────────── */}
        {loading ? (
          <Text style={styles.loadingText}>Chargement…</Text>
        ) : latestReview ? (
          <ReviewPreview review={latestReview} accentColor={config.color} />
        ) : (
          <View style={styles.emptyReview}>
            <Text style={styles.emptyReviewText}>Aucun avis encore.</Text>
            <Text style={styles.emptyReviewSub}>Glisse vers le haut pour en écrire un.</Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
    zIndex: 30,
  },

  // ── Zone draggable ─────────────────────────────────────────────────────────
  dragArea: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  dragHandle: {
    alignItems: "center",
    paddingBottom: 10,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    flex: 1,
    marginRight: 10,
  },
  scorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FFF4F2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scorePillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E8472A",
  },

  // ── Info restaurant ────────────────────────────────────────────────────────
  infoBlock: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 5,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  address: {
    fontSize: 13,
    color: "#888",
  },

  // ── Séparateur ─────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 10,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#EFEFEF",
  },
  dividerLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#bbb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Aperçu avis ────────────────────────────────────────────────────────────
  reviewPreview: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 6,
  },
  reviewMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 9,
    fontWeight: "700",
  },
  reviewUsername: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  reviewDot: {
    fontSize: 12,
    color: "#ccc",
  },
  reviewDate: {
    fontSize: 12,
    color: "#aaa",
  },
  reviewComment: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
    lineHeight: 18,
  },
  dimRow: {
    flexDirection: "row",
    gap: 6,
  },
  dim: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  dimLabel: {
    fontSize: 9,
    color: "#aaa",
    fontWeight: "500",
    textAlign: "center",
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreNA: {
    fontSize: 10,
    color: "#ccc",
  },

  // ── États vides / chargement ───────────────────────────────────────────────
  loadingText: {
    textAlign: "center",
    color: "#ccc",
    fontSize: 13,
    paddingVertical: 16,
  },
  emptyReview: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 4,
  },
  emptyReviewText: {
    fontSize: 13,
    color: "#888",
    fontWeight: "500",
  },
  emptyReviewSub: {
    fontSize: 12,
    color: "#bbb",
  },
});
