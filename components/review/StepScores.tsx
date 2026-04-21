import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScoreKey = "scoreQp" | "scoreAmbiance" | "scoreService" | "scoreFood";

type Props = {
  scoreQp: number | null;
  scoreAmbiance: number | null;
  scoreService: number | null;
  scoreFood: number | null;
  onChange: (key: ScoreKey, value: number) => void;
};

// ── Config dimensions ─────────────────────────────────────────────────────────

const DIMENSIONS: { key: ScoreKey; label: string; emoji: string }[] = [
  { key: "scoreQp",       label: "Qualité / Prix", emoji: "💰" },
  { key: "scoreAmbiance", label: "Ambiance",        emoji: "🎭" },
  { key: "scoreService",  label: "Service",          emoji: "🤝" },
  { key: "scoreFood",     label: "Assiette",         emoji: "🍽️" },
];

// ── StarRow ───────────────────────────────────────────────────────────────────

function StarRow({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stars}>
      {([1, 2, 3, 4, 5] as const).map((star) => {
        const filled = value != null && value >= star;
        return (
          <Pressable
            key={star}
            onPress={() => onChange(star)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Ionicons
              name={filled ? "star" : "star-outline"}
              size={38}
              color={filled ? "#E8472A" : "#DDD"}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function StepScores({
  scoreQp,
  scoreAmbiance,
  scoreService,
  scoreFood,
  onChange,
}: Props) {
  const values: Record<ScoreKey, number | null> = {
    scoreQp,
    scoreAmbiance,
    scoreService,
    scoreFood,
  };

  return (
    <View style={styles.container}>
      {DIMENSIONS.map(({ key, label, emoji }) => (
        <View key={key} style={styles.row}>
          <View style={styles.rowLabel}>
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={styles.label}>{label}</Text>
          </View>
          <StarRow value={values[key]} onChange={(v) => onChange(key, v)} />
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
    gap: 28,
  },
  row: {
    gap: 12,
  },
  rowLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emoji: {
    fontSize: 22,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  stars: {
    flexDirection: "row",
    gap: 6,
  },
});
