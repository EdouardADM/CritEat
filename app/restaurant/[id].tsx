import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getCategoryConfig } from "../../constants/categories";
import {
  useRestaurantDetail,
  avgScore,
  type ReviewDetail,
} from "../../hooks/useRestaurantDetail";
import { useMyReviewForRestaurant } from "../../hooks/useMyReviewForRestaurant";
import ReviewPhotosModal from "../../components/ReviewPhotosModal";
import { checkDistanceToRestaurant, type DistanceCheckResult } from "../../hooks/useDistanceCheck";
import DistanceGateModal from "../../components/review/DistanceGateModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

const DAY_ORDER = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function ScoreStars({ value }: { value: number | null }) {
  if (value == null) return <Text style={styles.scoreNA}>—</Text>;
  const full = Math.round(value);
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? "star" : "star-outline"}
          size={11}
          color={i < full ? "#E8472A" : "#ddd"}
          style={{ marginRight: 1 }}
        />
      ))}
    </View>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonBlock({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: "#e8e8e8", opacity }, style]}
    />
  );
}

function SkeletonScreen({ insets }: { insets: { top: number; bottom: number } }) {
  return (
    <View style={styles.container}>
      {/* Header placeholder */}
      <View style={[styles.coverPlaceholder, { backgroundColor: "#e8e8e8", height: 220 + insets.top }]} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <SkeletonBlock width="70%" height={22} style={{ marginBottom: 10 }} />
        <SkeletonBlock width="40%" height={16} style={{ marginBottom: 20 }} />

        {/* Score cards */}
        <View style={styles.scoreRow}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} width={74} height={72} borderRadius={12} />
          ))}
        </View>

        <SkeletonBlock width="100%" height={64} borderRadius={12} style={{ marginVertical: 16 }} />
        <SkeletonBlock width="100%" height={100} borderRadius={12} style={{ marginBottom: 12 }} />
        <SkeletonBlock width="100%" height={100} borderRadius={12} />
      </ScrollView>
    </View>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { restaurant: detail, reviews, loading, error } = useRestaurantDetail(id ?? null);
  const { myReview, loading: myReviewLoading } = useMyReviewForRestaurant(id ?? null);

  // ── Gate de distance ───────────────────────────────────────────────────────
  const [gateVisible, setGateVisible]     = useState(false);
  const [gateChecking, setGateChecking]   = useState(false);
  const [gateResult, setGateResult]       = useState<DistanceCheckResult | null>(null);
  const [gateRetryCount, setGateRetryCount] = useState(0);

  const runGateCheck = async () => {
    if (!detail) return;
    setGateChecking(true);
    setGateVisible(true);
    const result = await checkDistanceToRestaurant(
      detail.lat ?? 0,
      detail.lng ?? 0,
    );
    setGateChecking(false);
    if (result.status === "in_range") {
      setGateVisible(false);
      setGateResult(null);
      const distParam = result.distance_m != null ? `&gateDist=${result.distance_m}` : "";
      const accParam  = result.accuracy_m  != null ? `&gateAcc=${result.accuracy_m}`  : "";
      router.push(
        `/review/${detail.id}?name=${encodeURIComponent(detail.name)}&lat=${detail.lat ?? 0}&lng=${detail.lng ?? 0}${distParam}${accParam}` as any,
      );
    } else {
      setGateResult(result);
    }
  };

  const handleReviewPress = async () => {
    if (!detail) return;
    const isEdit = !!myReview;
    if (isEdit) {
      // Mode édition : pas de gate
      router.push(
        `/review/${detail.id}?name=${encodeURIComponent(detail.name)}&lat=${detail.lat ?? 0}&lng=${detail.lng ?? 0}&editId=${myReview!.id}` as any,
      );
      return;
    }
    setGateRetryCount(0);
    await runGateCheck();
  };

  const handleGateRetry = async () => {
    setGateRetryCount((c) => c + 1);
    await runGateCheck();
  };

  if (loading) return <SkeletonScreen insets={insets} />;

  if (error || !detail) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color="#E8472A" />
        <Text style={styles.errorTitle}>Impossible de charger ce restaurant</Text>
        <Text style={styles.errorSub}>{error ?? "Données introuvables"}</Text>
        <Pressable style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryText}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  const config = getCategoryConfig(detail.category);
  const coverColor = config.color;

  const dimensions = [
    { label: "Qualité/Prix", icon: "pricetag-outline" as const, value: avgScore(reviews, "score_qp") },
    { label: "Ambiance",     icon: "flame-outline" as const,    value: avgScore(reviews, "score_ambiance") },
    { label: "Service",      icon: "happy-outline" as const,    value: avgScore(reviews, "score_service") },
    { label: "Assiette",     icon: "restaurant-outline" as const, value: avgScore(reviews, "score_food") },
  ];

  const openingDays = detail.opening_hours
    ? DAY_ORDER.filter((d) => detail.opening_hours![d])
    : [];

  return (
    <View style={styles.container}>
      {/* ── Cover + back ──────────────────────────────────────────────────── */}
      <View style={[styles.cover, { backgroundColor: coverColor, paddingTop: insets.top }]}>
        <Pressable
          style={[styles.backBtn, { top: insets.top + 8 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>

        <View style={styles.coverContent}>
          <Text style={styles.coverEmoji}>{config.emoji}</Text>
          <Text style={styles.coverName} numberOfLines={2}>{detail.name}</Text>
          <Text style={styles.coverCity}>{detail.city}</Text>
        </View>
      </View>

      {/* ── Contenu scrollable ────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 96 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: coverColor + "18" }]}>
            <Text style={[styles.badgeText, { color: coverColor }]}>
              {config.emoji} {config.label}
            </Text>
          </View>
          {detail.review_count > 0 && (
            <View style={styles.badgeVerified}>
              <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
              <Text style={styles.badgeVerifiedText}>Avis vérifiés</Text>
            </View>
          )}
        </View>

        {/* ── Score composite ──────────────────────────────────────────────── */}
        {detail.composite_score != null && (
          <View style={[styles.compositeCard, { borderLeftColor: coverColor }]}>
            <View>
              <Text style={styles.compositeLabel}>Score global</Text>
              <Text style={styles.compositeSub}>
                Basé sur {detail.review_count} avis
              </Text>
            </View>
            <View style={styles.compositeScoreBox}>
              <Text style={[styles.compositeScore, { color: coverColor }]}>
                {detail.composite_score.toFixed(1)}
              </Text>
              <Text style={styles.compositeMax}>/5</Text>
            </View>
          </View>
        )}

        {/* ── 4 dimensions ─────────────────────────────────────────────────── */}
        {detail.review_count > 0 && (
          <View style={styles.scoreRow}>
            {dimensions.map((dim) => (
              <View key={dim.label} style={styles.scoreCard}>
                <Ionicons name={dim.icon} size={18} color={coverColor} />
                <Text style={styles.scoreDimValue}>
                  {dim.value != null ? dim.value.toFixed(1) : "—"}
                </Text>
                <Text style={styles.scoreDimLabel}>{dim.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Infos pratiques ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Infos pratiques</Text>

          {/* Adresse */}
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={17} color="#888" style={styles.infoIcon} />
            <Text style={styles.infoText}>{detail.address}, {detail.city}</Text>
          </View>

          {/* Téléphone */}
          {!!detail.phone && (
            <Pressable
              style={styles.infoRow}
              onPress={() => Linking.openURL(`tel:${detail.phone}`)}
            >
              <Ionicons name="call-outline" size={17} color="#888" style={styles.infoIcon} />
              <Text style={[styles.infoText, styles.infoLink]}>{detail.phone}</Text>
            </Pressable>
          )}

          {/* Site web */}
          {!!detail.website && (
            <Pressable
              style={styles.infoRow}
              onPress={() => Linking.openURL(detail.website!)}
            >
              <Ionicons name="globe-outline" size={17} color="#888" style={styles.infoIcon} />
              <Text style={[styles.infoText, styles.infoLink]} numberOfLines={1}>
                {detail.website.replace(/^https?:\/\/(www\.)?/, "")}
              </Text>
            </Pressable>
          )}

          {/* Horaires */}
          {openingDays.length > 0 && (
            <View style={styles.hoursBlock}>
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={17} color="#888" style={styles.infoIcon} />
                <Text style={styles.infoText}>Horaires</Text>
              </View>
              {openingDays.map((day) => (
                <View key={day} style={styles.hoursRow}>
                  <Text style={styles.hoursDay}>{DAY_LABELS[day] ?? day}</Text>
                  <Text style={styles.hoursTime}>{detail.opening_hours![day]}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Avis ──────────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Avis {detail.review_count > 0 ? `(${detail.review_count})` : ""}
          </Text>

          {reviews.length === 0 ? (
            <View style={styles.emptyReviews}>
              <Ionicons name="chatbubble-outline" size={32} color="#ddd" />
              <Text style={styles.emptyReviewsText}>Aucun avis pour l'instant</Text>
              <Text style={styles.emptyReviewsSub}>Soyez le premier à en écrire un !</Text>
            </View>
          ) : (
            reviews.map((review) => (
              <ReviewCard key={review.id} review={review} accentColor={coverColor} />
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Bouton fixe ───────────────────────────────────────────────────── */}
      <View style={[styles.ctaContainer, { paddingBottom: 16 + insets.bottom }]}>
        {(() => {
          const isEdit = !!myReview;
          return (
            <Pressable
              style={[
                styles.ctaBtn,
                { backgroundColor: coverColor },
                (myReviewLoading || gateChecking) && { opacity: 0.55 },
              ]}
              onPress={handleReviewPress}
              disabled={myReviewLoading || gateChecking}
            >
              <Ionicons
                name={isEdit ? "pencil-outline" : "create-outline"}
                size={18}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.ctaBtnText}>
                {isEdit ? "Modifier mon avis" : "Écrire un avis"}
              </Text>
            </Pressable>
          );
        })()}
      </View>

      {/* ── Gate de distance ──────────────────────────────────────────────── */}
      <DistanceGateModal
        visible={gateVisible}
        result={gateResult}
        restaurantName={detail.name}
        onRetry={handleGateRetry}
        onClose={() => { setGateVisible(false); setGateResult(null); }}
        retryCount={gateRetryCount}
        checking={gateChecking}
      />
    </View>
  );
}

// ── ReviewCard ────────────────────────────────────────────────────────────────

function ReviewCard({ review, accentColor }: { review: ReviewDetail; accentColor: string }) {
  const [photosModalVisible, setPhotosModalVisible] = useState(false);

  const initials = review.username
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.reviewCard}>
      {/* En-tête */}
      <View style={styles.reviewHeader}>
        <View style={[styles.avatar, { backgroundColor: accentColor + "20" }]}>
          <Text style={[styles.avatarText, { color: accentColor }]}>{initials}</Text>
        </View>

        {/* Nom + date + score pill — occupe tout l'espace disponible */}
        <View style={styles.reviewMeta}>
          <View style={styles.reviewNameRow}>
            <Text style={styles.reviewUsername}>{review.username}</Text>
            {review.is_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                <Text style={styles.verifiedText}>Vérifié</Text>
              </View>
            )}
          </View>
          <View style={styles.reviewSubRow}>
            <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
            {new Date(review.updated_at).getTime() -
              new Date(review.created_at).getTime() > 2000 && (
              <Text style={styles.reviewEdited}>(modifié)</Text>
            )}
            {review.global_score != null && (
              <View style={[styles.reviewScorePill, { backgroundColor: accentColor + "18" }]}>
                <Ionicons name="star" size={10} color={accentColor} />
                <Text style={[styles.reviewScorePillText, { color: accentColor }]}>
                  {review.global_score.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Vignette photo — droite du header */}
        {review.review_photos.length > 0 && (
          <Pressable
            style={styles.reviewPhotoThumb}
            onPress={() => setPhotosModalVisible(true)}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Image
              source={{ uri: review.review_photos[0].url }}
              style={styles.reviewPhotoImage}
              resizeMode="cover"
            />
            {review.review_photos.length > 1 && (
              <View style={styles.reviewPhotoBadge}>
                <Text style={styles.reviewPhotoBadgeText}>
                  +{review.review_photos.length - 1}
                </Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {/* Mini-scores */}
      <View style={styles.reviewMiniScores}>
        {[
          { label: "Qualité/Prix", value: review.score_qp },
          { label: "Ambiance",     value: review.score_ambiance },
          { label: "Service",      value: review.score_service },
          { label: "Assiette",     value: review.score_food },
        ].map((dim) => (
          <View key={dim.label} style={styles.reviewMiniScore}>
            <Text style={styles.reviewMiniLabel}>{dim.label}</Text>
            <ScoreStars value={dim.value} />
          </View>
        ))}
      </View>

      {/* Commentaire */}
      {!!review.comment && (
        <Text style={styles.reviewComment}>{review.comment}</Text>
      )}

      {/* Modal carrousel photos */}
      {review.review_photos.length > 0 && (
        <ReviewPhotosModal
          visible={photosModalVisible}
          photos={review.review_photos}
          onClose={() => setPhotosModalVisible(false)}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f7" },
  centered: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },

  // ── Cover ──────────────────────────────────────────────────────────────────
  cover: {
    height: 220,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  coverPlaceholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverContent: {
    gap: 4,
  },
  coverEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  coverName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 28,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  coverCity: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // ── Badges ─────────────────────────────────────────────────────────────────
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeVerified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeVerifiedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16A34A",
  },

  // ── Score composite ────────────────────────────────────────────────────────
  compositeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  compositeLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  compositeSub: {
    fontSize: 12,
    color: "#888",
  },
  compositeScoreBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  compositeScore: {
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 36,
  },
  compositeMax: {
    fontSize: 14,
    color: "#aaa",
    fontWeight: "600",
    marginBottom: 4,
  },

  // ── 4 dimensions ───────────────────────────────────────────────────────────
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 16,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  scoreDimValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  scoreDimLabel: {
    fontSize: 9,
    color: "#888",
    fontWeight: "500",
    textAlign: "center",
  },
  scoreNA: {
    fontSize: 13,
    color: "#ccc",
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // ── Sections ───────────────────────────────────────────────────────────────
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },

  // ── Infos pratiques ────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  infoIcon: {
    marginRight: 10,
    width: 20,
  },
  infoText: {
    fontSize: 14,
    color: "#444",
    flex: 1,
    lineHeight: 20,
  },
  infoLink: {
    color: "#2563EB",
  },
  hoursBlock: {
    marginTop: 4,
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 30,
    marginBottom: 4,
  },
  hoursDay: {
    fontSize: 13,
    color: "#555",
    fontWeight: "500",
  },
  hoursTime: {
    fontSize: 13,
    color: "#777",
  },

  // ── Avis vides ─────────────────────────────────────────────────────────────
  emptyReviews: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 6,
  },
  emptyReviewsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#aaa",
  },
  emptyReviewsSub: {
    fontSize: 12,
    color: "#ccc",
  },

  // ── Review card ────────────────────────────────────────────────────────────
  reviewCard: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
    minHeight: 52, // réserve la hauteur pour la vignette photo (3.2)
  },
  reviewMeta: {
    flex: 1,
  },
  reviewSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  reviewScorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reviewScorePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  reviewPhotoThumb: {
    width: 76,
    height: 76,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
    flexShrink: 0,
  },
  reviewPhotoImage: {
    width: "100%",
    height: "100%",
  },
  reviewPhotoBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  reviewPhotoBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "700",
  },
  reviewNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  reviewUsername: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  verifiedText: {
    fontSize: 10,
    color: "#16A34A",
    fontWeight: "600",
  },
  reviewDate: {
    fontSize: 11,
    color: "#aaa",
  },
  reviewEdited: {
    fontSize: 10,
    color: "#bbb",
    fontStyle: "italic",
  },
  reviewMiniScores: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  reviewMiniScore: {
    gap: 2,
    minWidth: "45%",
  },
  reviewMiniLabel: {
    fontSize: 10,
    color: "#aaa",
    fontWeight: "500",
  },
  reviewComment: {
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
  },

  // ── CTA ────────────────────────────────────────────────────────────────────
  ctaContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 10,
  },
  ctaBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },

  // ── Erreur ─────────────────────────────────────────────────────────────────
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginTop: 12,
    textAlign: "center",
  },
  errorSub: {
    fontSize: 13,
    color: "#888",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: "#E8472A",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
