import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getCategoryConfig } from "../constants/categories";
import type { Restaurant } from "../hooks/useRestaurants";
import {
  useRestaurantDetail,
  avgScore,
  type ReviewDetail,
} from "../hooks/useRestaurantDetail";

// ── Constantes ────────────────────────────────────────────────────────────────

const SCREEN_HEIGHT = Dimensions.get("window").height;

const DAY_LABELS: Record<string, string> = {
  monday: "Lundi", tuesday: "Mardi", wednesday: "Mercredi",
  thursday: "Jeudi", friday: "Vendredi", saturday: "Samedi", sunday: "Dimanche",
};
const DAY_ORDER = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

type SheetState = "peek" | "mid" | "full";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
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

function ReviewRow({ review, accentColor }: { review: ReviewDetail; accentColor: string }) {
  const initials = review.username
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewHeader}>
        <View style={[styles.avatar, { backgroundColor: accentColor + "20" }]}>
          <Text style={[styles.avatarText, { color: accentColor }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.reviewNameRow}>
            <Text style={styles.reviewUsername}>{review.username}</Text>
            {review.is_verified && (
              <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
            )}
          </View>
          <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
        </View>
        {review.global_score != null && (
          <View style={[styles.reviewScoreBubble, { backgroundColor: accentColor }]}>
            <Text style={styles.reviewScoreBubbleText}>
              {review.global_score.toFixed(1)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.reviewMiniScores}>
        {[
          { label: "QP",       value: review.score_qp },
          { label: "Ambiance", value: review.score_ambiance },
          { label: "Service",  value: review.score_service },
          { label: "Assiette", value: review.score_food },
        ].map((d) => (
          <View key={d.label} style={styles.reviewMiniScore}>
            <Text style={styles.reviewMiniLabel}>{d.label}</Text>
            <ScoreStars value={d.value} />
          </View>
        ))}
      </View>
      {!!review.comment && (
        <Text style={styles.reviewComment}>{review.comment}</Text>
      )}
    </View>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

type Props = {
  restaurant: Restaurant;
  onClose: () => void;
  bottomInset: number;
  /** Appelé quand la card entre en état "mid" */
  onMidExpand: () => void;
  /** Appelé quand la card entre en état "full" */
  onFullExpand: () => void;
  /** Appelé quand la card retourne en état "peek" */
  onCollapse: () => void;
};

export default function RestaurantPreviewCard({
  restaurant,
  onClose,
  bottomInset,
  onMidExpand,
  onFullExpand,
  onCollapse,
}: Props) {
  const router = useRouter();
  const config = getCategoryConfig(restaurant.category);
  // topInset lu directement depuis le hook — pas besoin de le passer en prop
  const { top: topInset } = useSafeAreaInsets();

  // ── Machine à états ───────────────────────────────────────────────────────
  const [sheetState, setSheetState] = useState<SheetState>("peek");
  // Ref pour les closures PanResponder (évite les stale closures)
  const sheetStateRef = useRef<SheetState>("peek");
  // Fetch lazy : déclenché au premier passage en mid ou full
  const [hasFetched, setHasFetched] = useState(false);

  const { restaurant: detail, reviews, loading: detailLoading, error: detailError } =
    useRestaurantDetail(hasFetched ? restaurant.id : null);

  // ── Hauteurs ──────────────────────────────────────────────────────────────
  // peek  : 160px + bottom inset
  // mid   : 60 % de l'écran, limité à (SCREEN_HEIGHT - 120) pour rester sous la SearchBar
  // full  : hauteur écran moins la zone safe-area haute (heure/wifi)
  //         + paddingTop: topInset sur la card → contenu toujours sous la barre
  const PEEK_HEIGHT = 160 + bottomInset;
  const MID_HEIGHT  = Math.min(SCREEN_HEIGHT * 0.60, SCREEN_HEIGHT - 120);
  const FULL_HEIGHT = SCREEN_HEIGHT - topInset;

  // ── Animations ───────────────────────────────────────────────────────────
  // translateY : entrée depuis le bas (native driver ✓)
  const translateY = useRef(new Animated.Value(200)).current;
  // translateX : glissement vers la droite pour fermer (native driver ✓)
  const slideX     = useRef(new Animated.Value(0)).current;
  // height : transitions d'état (non-native — height n'est pas supporté natif)
  const heightAnim = useRef(new Animated.Value(PEEK_HEIGHT)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [translateY]);

  // ── Transition ────────────────────────────────────────────────────────────
  // transitionToRef est mis à jour à chaque render pour que le PanResponder
  // (créé une seule fois) appelle toujours la version la plus récente.
  const transitionToRef = useRef<(next: SheetState) => void>(() => {});

  const transitionTo = (next: SheetState) => {
    sheetStateRef.current = next;
    setSheetState(next);
    if (next !== "peek") setHasFetched(true);

    const toHeight = next === "peek" ? PEEK_HEIGHT
                   : next === "mid"  ? MID_HEIGHT
                   : FULL_HEIGHT;

    Animated.spring(heightAnim, {
      toValue: toHeight,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();

    if (next === "mid")  onMidExpand();
    else if (next === "full") onFullExpand();
    else                 onCollapse();
  };

  // Mise à jour chaque render (hors PanResponder.create)
  transitionToRef.current = transitionTo;

  // onCloseRef : même pattern — évite la stale closure dans swipePanResponder
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ── PanResponder vertical (dragArea) ──────────────────────────────────────
  // Attaché sur le dragArea (indicateur + header).
  // onMoveShouldSetPanResponder (pas onStart) → les taps sur ✕ passent au Pressable.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 8,
      onPanResponderRelease: (_, { dy }) => {
        const s = sheetStateRef.current;
        if (dy < -50) {
          if (s === "peek") transitionToRef.current("mid");
          else if (s === "mid") transitionToRef.current("full");
        } else if (dy > 50) {
          if (s === "full") transitionToRef.current("mid");
          else if (s === "mid") transitionToRef.current("peek");
        }
      },
    })
  ).current;

  // ── PanResponder horizontal (toute la card) ───────────────────────────────
  // Capture uniquement les gestes où le mouvement horizontal est dominant.
  // Coexiste avec le panResponder vertical : les deux utilisent onMoveShouldSet
  // (pas onStart), donc le geste est attribué au premier dont la condition est vraie.
  // Vertical (|dy| > 8) et horizontal (dx > 30 && |dx| > |dy|) ne se chevauchent pas.
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

  // ── Données expanded ──────────────────────────────────────────────────────
  const dimensions = [
    { label: "Qualité/Prix", icon: "pricetag-outline"  as const, value: avgScore(reviews, "score_qp") },
    { label: "Ambiance",     icon: "flame-outline"      as const, value: avgScore(reviews, "score_ambiance") },
    { label: "Service",      icon: "happy-outline"      as const, value: avgScore(reviews, "score_service") },
    { label: "Assiette",     icon: "restaurant-outline" as const, value: avgScore(reviews, "score_food") },
  ];

  const openingDays = detail?.opening_hours
    ? DAY_ORDER.filter((d) => detail.opening_hours![d])
    : [];

  const showDetail = sheetState !== "peek";
  const isFull     = sheetState === "full";

  // ── Rendu ─────────────────────────────────────────────────────────────────
  // translateY (entrée) + slideX (swipe-to-close) — tous deux native driver
  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY }, { translateX: slideX }] }]}
    >
      <Animated.View
        {...swipePanResponder.panHandlers}
        style={[
          styles.card,
          { height: heightAnim },
          // En état full : supprime les arrondis + paddingTop pour contenu sous wifi/heure
          isFull && styles.cardFull,
          isFull && { paddingTop: topInset + 16 },
        ]}
      >
        {/* ── Zone draggable : indicateur + header ──────────────────────── */}
        <View
          {...panResponder.panHandlers}
          style={styles.dragArea}
        >
          <View style={styles.dragHandle}>
            <View style={styles.dragBar} />
          </View>
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={2}>{restaurant.name}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Contenu peek (toujours visible) ───────────────────────────── */}
        <View style={styles.peekContent}>
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
          {!!restaurant.address && (
            <Text style={styles.address} numberOfLines={1}>{restaurant.address}</Text>
          )}
          {restaurant.review_count > 0 && (
            <Text style={styles.reviewCount}>{restaurant.review_count} avis</Text>
          )}
        </View>

        {/* ── Contenu mid/full ──────────────────────────────────────────── */}
        {showDetail && (
          <>
            <View style={styles.divider} />

            {/*
              ScrollView prend tout l'espace restant (flex: 1) entre le header et le CTA.
              En état mid, onScrollBeginDrag déclenche automatiquement la transition → full
              (l'utilisateur veut voir plus de contenu).
            */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => {
                if (sheetStateRef.current === "mid") {
                  transitionToRef.current("full");
                }
              }}
            >
              {detailLoading && (
                <Text style={styles.loadingText}>Chargement…</Text>
              )}
              {detailError != null && (
                <Text style={styles.errorText}>{detailError}</Text>
              )}

              {!detailLoading && !detailError && detail && (
                <>
                  {/* Score composite */}
                  {detail.composite_score != null && (
                    <View style={[styles.compositeCard, { borderLeftColor: config.color }]}>
                      <View>
                        <Text style={styles.compositeLabel}>Score global</Text>
                        <Text style={styles.compositeSub}>{detail.review_count} avis</Text>
                      </View>
                      <View style={styles.compositeScoreBox}>
                        <Text style={[styles.compositeScore, { color: config.color }]}>
                          {detail.composite_score.toFixed(1)}
                        </Text>
                        <Text style={styles.compositeMax}>/5</Text>
                      </View>
                    </View>
                  )}

                  {/* 4 dimensions */}
                  {reviews.length > 0 && (
                    <View style={styles.scoreRow}>
                      {dimensions.map((dim) => (
                        <View key={dim.label} style={styles.scoreCard}>
                          <Ionicons name={dim.icon} size={15} color={config.color} />
                          <Text style={styles.scoreDimValue}>
                            {dim.value != null ? dim.value.toFixed(1) : "—"}
                          </Text>
                          <Text style={styles.scoreDimLabel}>{dim.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Infos pratiques */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Infos pratiques</Text>
                    <View style={styles.infoRow}>
                      <Ionicons name="location-outline" size={14} color="#888" style={styles.infoIcon} />
                      <Text style={styles.infoText}>
                        {detail.address}{detail.city ? `, ${detail.city}` : ""}
                      </Text>
                    </View>
                    {!!detail.phone && (
                      <Pressable
                        style={styles.infoRow}
                        onPress={() => Linking.openURL(`tel:${detail.phone}`)}
                      >
                        <Ionicons name="call-outline" size={14} color="#888" style={styles.infoIcon} />
                        <Text style={[styles.infoText, styles.infoLink]}>{detail.phone}</Text>
                      </Pressable>
                    )}
                    {!!detail.website && (
                      <Pressable
                        style={styles.infoRow}
                        onPress={() => Linking.openURL(detail.website!)}
                      >
                        <Ionicons name="globe-outline" size={14} color="#888" style={styles.infoIcon} />
                        <Text style={[styles.infoText, styles.infoLink]} numberOfLines={1}>
                          {detail.website.replace(/^https?:\/\/(www\.)?/, "")}
                        </Text>
                      </Pressable>
                    )}
                    {openingDays.length > 0 && (
                      <>
                        <View style={styles.infoRow}>
                          <Ionicons name="time-outline" size={14} color="#888" style={styles.infoIcon} />
                          <Text style={styles.infoText}>Horaires</Text>
                        </View>
                        {openingDays.map((day) => (
                          <View key={day} style={styles.hoursRow}>
                            <Text style={styles.hoursDay}>{DAY_LABELS[day] ?? day}</Text>
                            <Text style={styles.hoursTime}>{detail.opening_hours![day]}</Text>
                          </View>
                        ))}
                      </>
                    )}
                  </View>

                  {/* Avis */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Avis{reviews.length > 0 ? ` (${reviews.length})` : ""}
                    </Text>
                    {reviews.length === 0 ? (
                      <View style={styles.emptyReviews}>
                        <Ionicons name="chatbubble-outline" size={26} color="#ddd" />
                        <Text style={styles.emptyReviewsText}>Aucun avis pour l'instant</Text>
                      </View>
                    ) : (
                      reviews.map((r) => (
                        <ReviewRow key={r.id} review={r} accentColor={config.color} />
                      ))
                    )}
                  </View>
                </>
              )}
            </ScrollView>

            {/* Bouton fixe en bas — hors du ScrollView */}
            <View style={[styles.ctaContainer, { paddingBottom: 12 + bottomInset }]}>
              {isFull && (
                <Pressable
                  style={[styles.ctaBtn, styles.ctaBtnSecondary, { borderColor: config.color }]}
                  onPress={() => router.push(`/restaurant/${restaurant.id}`)}
                >
                  <Text style={[styles.ctaBtnText, { color: config.color }]}>Voir la fiche complète</Text>
                  <Ionicons name="chevron-forward" size={15} color={config.color} style={{ marginLeft: 4 }} />
                </Pressable>
              )}
              <Pressable
                style={[styles.ctaBtn, { backgroundColor: config.color }]}
                onPress={() =>
                  router.push(
                    `/review/${restaurant.id}?name=${encodeURIComponent(restaurant.name)}&lat=${restaurant.latitude}&lng=${restaurant.longitude}`
                  )
                }
              >
                <Ionicons name="create-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.ctaBtnText}>Écrire un avis</Text>
              </Pressable>
            </View>
          </>
        )}

      </Animated.View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Structure ──────────────────────────────────────────────────────────────
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
    overflow: "hidden",
    flexDirection: "column",
  },
  // Supprime les arrondis en état full (plein écran)
  cardFull: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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

  // ── Contenu peek ───────────────────────────────────────────────────────────
  peekContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
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
    marginTop: 4,
    marginBottom: 4,
  },
  reviewCount: {
    fontSize: 12,
    color: "#aaa",
  },

  // ── Séparateur peek / detail ───────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginHorizontal: 20,
    marginBottom: 4,
  },

  // ── ScrollView mid/full ────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  loadingText: {
    textAlign: "center",
    color: "#aaa",
    fontSize: 13,
    marginVertical: 24,
  },
  errorText: {
    textAlign: "center",
    color: "#E8472A",
    fontSize: 13,
    marginVertical: 24,
  },

  // ── Score composite ────────────────────────────────────────────────────────
  compositeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fafafa",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  compositeLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  compositeSub: {
    fontSize: 11,
    color: "#888",
  },
  compositeScoreBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  compositeScore: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
  },
  compositeMax: {
    fontSize: 12,
    color: "#aaa",
    fontWeight: "600",
    marginBottom: 2,
  },

  // ── 4 dimensions ───────────────────────────────────────────────────────────
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 12,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: "#fafafa",
    borderRadius: 10,
    padding: 8,
    alignItems: "center",
    gap: 3,
  },
  scoreDimValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  scoreDimLabel: {
    fontSize: 8,
    color: "#888",
    fontWeight: "500",
    textAlign: "center",
  },
  scoreNA: {
    fontSize: 11,
    color: "#ccc",
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // ── Sections ───────────────────────────────────────────────────────────────
  section: {
    backgroundColor: "#fafafa",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 10,
  },

  // ── Infos pratiques ────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoIcon: {
    marginRight: 8,
    width: 18,
  },
  infoText: {
    fontSize: 13,
    color: "#444",
    flex: 1,
    lineHeight: 18,
  },
  infoLink: {
    color: "#2563EB",
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 26,
    marginBottom: 3,
  },
  hoursDay: {
    fontSize: 12,
    color: "#555",
    fontWeight: "500",
  },
  hoursTime: {
    fontSize: 12,
    color: "#777",
  },

  // ── Avis vides ─────────────────────────────────────────────────────────────
  emptyReviews: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 6,
  },
  emptyReviewsText: {
    fontSize: 13,
    color: "#bbb",
  },

  // ── ReviewRow ──────────────────────────────────────────────────────────────
  reviewRow: {
    borderTopWidth: 1,
    borderTopColor: "#efefef",
    paddingTop: 12,
    marginTop: 2,
    marginBottom: 2,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
  },
  reviewNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  reviewUsername: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  reviewDate: {
    fontSize: 10,
    color: "#aaa",
  },
  reviewScoreBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewScoreBubbleText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  reviewMiniScores: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  reviewMiniScore: {
    minWidth: "44%",
    gap: 2,
  },
  reviewMiniLabel: {
    fontSize: 9,
    color: "#aaa",
    fontWeight: "500",
  },
  reviewComment: {
    fontSize: 12,
    color: "#555",
    lineHeight: 18,
  },

  // ── CTA ────────────────────────────────────────────────────────────────────
  ctaContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    backgroundColor: "#fff",
  },
  ctaBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    marginBottom: 8,
  },
  ctaBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
