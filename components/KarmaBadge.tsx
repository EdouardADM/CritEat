import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getKarma } from "../constants/karma";

// Badge de palier de karma réutilisable.
// - `md` (défaut) : pour le profil.
// - `sm` : compact, pour les cartes d'avis.
// Robuste à un palier inconnu (fallback Novice via getKarma).

type Props = {
  tier: string | null | undefined;
  size?: "sm" | "md";
};

export default function KarmaBadge({ tier, size = "md" }: Props) {
  const karma = getKarma(tier);
  const sm = size === "sm";

  return (
    <View
      style={[
        styles.badge,
        sm ? styles.badgeSm : styles.badgeMd,
        { backgroundColor: karma.color + "18", borderColor: karma.color + "40" },
      ]}
    >
      <Ionicons name={karma.icon as any} size={sm ? 11 : 13} color={karma.color} />
      <Text style={[sm ? styles.textSm : styles.textMd, { color: karma.color }]}>
        {karma.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeMd: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeSm: {
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  textMd: {
    fontSize: 12,
    fontWeight: "600",
  },
  textSm: {
    fontSize: 10,
    fontWeight: "600",
  },
});
