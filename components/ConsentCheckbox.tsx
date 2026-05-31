import { Pressable, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Case à cocher de consentement RGPD avec lien vers la politique.
// L'acceptation doit être explicite (case décochée par défaut).

type Props = {
  checked: boolean;
  onToggle: () => void;
};

export default function ConsentCheckbox({ checked, onToggle }: Props) {
  const router = useRouter();

  return (
    <Pressable style={styles.row} onPress={onToggle} hitSlop={6}>
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={22}
        color={checked ? "#E8472A" : "#999"}
      />
      <Text style={styles.text}>
        J&apos;accepte la{" "}
        <Text
          style={styles.link}
          onPress={(e) => {
            // Évite de cocher la case en cliquant sur le lien.
            e.stopPropagation();
            router.push("/privacy");
          }}
        >
          politique de confidentialité
        </Text>
        .
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
  },
  link: {
    color: "#E8472A",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
