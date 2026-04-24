import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReviewDraft } from "../../hooks/useReviewDraft";

// ── Mini composant étoiles ────────────────────────────────────────────────────

function MiniStars({ value }: { value: number | null }) {
  if (value == null) return null;
  const filled = Math.round(value);
  return (
    <View style={styles.miniStars}>
      {([1, 2, 3, 4, 5] as const).map((s) => (
        <Ionicons
          key={s}
          name={filled >= s ? "star" : "star-outline"}
          size={13}
          color={filled >= s ? "#E8472A" : "#DDD"}
        />
      ))}
    </View>
  );
}

// ── Config dimensions ─────────────────────────────────────────────────────────

type ScoreField = "scoreQp" | "scoreAmbiance" | "scoreService" | "scoreFood";

const SCORE_LABELS: { key: ScoreField; label: string }[] = [
  { key: "scoreQp",       label: "Qualité / Prix" },
  { key: "scoreAmbiance", label: "Ambiance"        },
  { key: "scoreService",  label: "Service"          },
  { key: "scoreFood",     label: "Assiette"         },
];

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  draft: ReviewDraft;
  restaurantName: string;
};

// ── Composant ─────────────────────────────────────────────────────────────────

export default function StepConfirm({ draft, restaurantName }: Props) {
  const scores = [
    draft.scoreQp,
    draft.scoreAmbiance,
    draft.scoreService,
    draft.scoreFood,
  ].filter((s): s is number => s != null);
  const avg = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Photo + nom du restaurant */}
      <View style={styles.topRow}>
        {draft.photos?.[0] && (
          <Image source={{ uri: draft.photos[0] }} style={styles.thumb} />
        )}
        <View style={styles.restaurantInfo}>
          <Text style={styles.restaurantName} numberOfLines={2}>
            {restaurantName}
          </Text>
          {avg != null && (
            <View style={styles.avgRow}>
              <MiniStars value={avg} />
              <Text style={styles.avgText}>{avg.toFixed(1)} / 5</Text>
            </View>
          )}
        </View>
      </View>

      {/* Scores détaillés */}
      <View style={styles.card}>
        {SCORE_LABELS.map(({ key, label }) => (
          <View key={key} style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>{label}</Text>
            <MiniStars value={draft[key]} />
          </View>
        ))}
      </View>

      {/* Extrait du commentaire */}
      <View style={styles.card}>
        <Text style={styles.commentText} numberOfLines={4}>
          {draft.comment}
        </Text>
      </View>

      <Text style={styles.hint}>
        En publiant, votre position sera vérifiée pour l'attribution du badge "vérifié".
      </Text>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingTop: 8, paddingBottom: 24, gap: 16 },

  // ── En-tête photo / restaurant ───────────────────────────────────────────────
  topRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: 10,
    backgroundColor: "#F0F0F0",
  },
  restaurantInfo: {
    flex: 1,
    gap: 8,
    paddingTop: 4,
  },
  restaurantName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  avgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  avgText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E8472A",
  },
  miniStars: {
    flexDirection: "row",
    gap: 2,
  },

  // ── Carte ─────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#F8F8F8",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#555",
  },
  commentText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 21,
  },

  // ── Note de bas de page ───────────────────────────────────────────────────────
  hint: {
    fontSize: 12,
    color: "#AAA",
    textAlign: "center",
    paddingHorizontal: 8,
    lineHeight: 18,
  },
});
