import { useCallback, useEffect, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { getCategoryConfig } from "../constants/categories";
import type { Restaurant } from "../hooks/useRestaurants";
import { useRestaurantDetail, type ReviewDetail } from "../hooks/useRestaurantDetail";
import Avatar from "./Avatar";

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
        <Avatar
          uri={review.avatar_url}
          initials={initials}
          size={24}
          backgroundColor={accentColor + "20"}
          textColor={accentColor}
        />
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

  // ── Animations (reanimated, thread UI) ────────────────────────────────────
  const translateY = useSharedValue(300);
  const translateX = useSharedValue(0);

  // Ressort nettement sur-amorti (damping élevé p/r à stiffness) → aucune
  // oscillation : décélération douce à l'ouverture, sans rebond perceptible.
  const SPRING = { damping: 42, stiffness: 200 } as const;

  // ── Refs pour éviter stale closures ──────────────────────────────────────
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const routerRef = useRef(router);
  routerRef.current = router;
  const restaurantIdRef = useRef(restaurant.id);
  restaurantIdRef.current = restaurant.id;
  // Garde anti double-déclenchement : empêche qu'une seconde animation/geste
  // rappelle onClose/navigate alors qu'une transition est déjà en cours.
  const isLeaving = useRef(false);

  // Entrée : la card monte de 300 → 0. Card keyée par id côté map → se rejoue
  // proprement à chaque sélection.
  useEffect(() => {
    translateY.value = withSpring(0, SPRING);
  }, [translateY]);

  // Retour sur la map après navigation (swipe-up) → la card est restée montée
  // hors écran (translateY -400) : on la repositionne et on relâche la garde.
  useFocusEffect(
    useCallback(() => {
      isLeaving.current = false;
      translateY.value = withSpring(0, SPRING);
      translateX.value = 0;
    }, [translateY, translateX])
  );

  const close = useCallback(() => {
    if (isLeaving.current) return;
    isLeaving.current = true;
    onCloseRef.current();
  }, []);

  const navigate = useCallback(() => {
    if (isLeaving.current) return;
    isLeaving.current = true;
    routerRef.current.push(`/restaurant/${restaurantIdRef.current}`);
  }, []);

  // ── Geste vertical (drag) ─────────────────────────────────────────────────
  // S'active seulement sur un mouvement vertical délibéré (≥15px), échoue si le
  // geste part en horizontal. Swipe-up → fiche, swipe-down → ferme, sinon retour.
  const dragGesture = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .failOffsetX([-25, 25])
    .onUpdate((e) => {
      translateY.value = Math.min(Math.max(e.translationY, -60), 400);
    })
    .onEnd((e) => {
      if (e.translationY < -60 || e.velocityY < -800) {
        translateY.value = withTiming(-400, { duration: 180 }, (done) => {
          if (done) runOnJS(navigate)();
        });
      } else if (e.translationY > 100 || e.velocityY > 800) {
        translateY.value = withTiming(600, { duration: 200 }, (done) => {
          if (done) runOnJS(close)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  // ── Geste horizontal (swipe droite → ferme) ───────────────────────────────
  const swipeGesture = Gesture.Pan()
    .activeOffsetX(25)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      translateX.value = Math.max(e.translationX, 0);
    })
    .onEnd((e) => {
      if (e.translationX > 80 || e.velocityX > 800) {
        translateX.value = withTiming(400, { duration: 200 }, (done) => {
          if (done) runOnJS(close)();
        });
      } else {
        translateX.value = withSpring(0, SPRING);
      }
    });

  // ── Tap → agrandir (fiche plein écran), en plus du swipe-up ───────────────
  // Échoue si le doigt bouge (maxDistance) → ne se déclenche pas sur un drag/swipe.
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(12)
    .onEnd((_e, success) => {
      if (success) runOnJS(navigate)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
  }));

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <View style={[styles.card, { paddingBottom: bottomInset }]}>
        {/* Bouton de fermeture explicite — placé HORS de la zone tap/swipe pour
            qu'un tap sur ✕ ferme (et n'agrandisse pas la fiche). */}
        <Pressable style={styles.closeBtn} onPress={close} hitSlop={8}>
          <Ionicons name="close" size={18} color="#888" />
        </Pressable>

        {/* Tap → agrandir (fiche plein écran) ; swipe horizontal → fermer.
            Le drag vertical reste géré par le GestureDetector imbriqué. */}
        <GestureDetector gesture={Gesture.Race(swipeGesture, tapGesture)}>
          <View>
            {/* ── Zone draggable ──────────────────────────────────────────── */}
            <GestureDetector gesture={dragGesture}>
              <View style={styles.dragArea}>
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
          </GestureDetector>

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
          </View>
        </GestureDetector>
      </View>
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
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
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
