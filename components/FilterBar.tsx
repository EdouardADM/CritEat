import { ScrollView, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CATEGORY_CONFIG, RestaurantCategory } from "../constants/categories";

const ACCENT = "#E8472A";

type Props = {
  activeCategories: RestaurantCategory[];
  onToggle: (category: RestaurantCategory) => void;
  friendsActive: boolean;
  onToggleFriends: () => void;
};

export default function FilterBar({
  activeCategories,
  onToggle,
  friendsActive,
  onToggleFriends,
}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.scroll}
    >
      {/* Puce « Amis » (restos notés par mes abonnements) */}
      <Pressable
        style={[
          styles.chip,
          friendsActive && { backgroundColor: ACCENT, borderColor: ACCENT },
        ]}
        onPress={onToggleFriends}
      >
        <Ionicons
          name="people"
          size={13}
          color={friendsActive ? "#fff" : ACCENT}
        />
        <Text style={[styles.label, friendsActive && styles.labelActive]}>
          Amis
        </Text>
      </Pressable>

      {(Object.entries(CATEGORY_CONFIG) as [RestaurantCategory, (typeof CATEGORY_CONFIG)[RestaurantCategory]][]).map(
        ([key, config]) => {
          const isActive = activeCategories.includes(key);
          return (
            <Pressable
              key={key}
              style={[
                styles.chip,
                isActive && { backgroundColor: config.color, borderColor: config.color },
              ]}
              onPress={() => onToggle(key)}
            >
              <Text style={styles.emoji}>{config.emoji}</Text>
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {config.label}
              </Text>
            </Pressable>
          );
        }
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 12,
    gap: 6,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  emoji: { fontSize: 13 },
  label: { fontSize: 12, fontWeight: "600", color: "#374151" },
  labelActive: { color: "#fff" },
});
