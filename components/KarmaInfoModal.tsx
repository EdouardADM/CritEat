import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import KarmaBadge from "./KarmaBadge";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const TIERS: { tier: string; text: string }[] = [
  { tier: "novice", text: "Tes premiers avis. Tout le monde commence ici." },
  { tier: "confirmed_critic", text: "Tes avis sont régulièrement jugés utiles par la communauté." },
  {
    tier: "local_expert",
    text: "Référence locale : tes avis pèsent davantage dans la note d'un restaurant.",
  },
];

export default function KarmaInfoModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Icône */}
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark-outline" size={36} color="#E8472A" />
          </View>

          <Text style={styles.title}>Le Karma</Text>
          <Text style={styles.body}>
            Le Karma est un score de fiabilité de 0 à 100, fondé sur les votes que tes avis
            reçoivent. Plus tes avis sont jugés utiles, plus ton Karma augmente.
          </Text>

          {/* Paliers */}
          <Text style={styles.sectionTitle}>Les paliers</Text>
          {TIERS.map((t) => (
            <View key={t.tier} style={styles.tierRow}>
              <KarmaBadge tier={t.tier} />
              <Text style={styles.tierText}>{t.text}</Text>
            </View>
          ))}

          {/* Progresser */}
          <Text style={styles.sectionTitle}>Comment progresser ?</Text>
          <Text style={styles.body}>
            Reçois des votes positifs sur des avis utiles, sur la durée. Un avis sincère, détaillé et
            sur place est le meilleur moyen de gagner du Karma.
          </Text>

          <Pressable style={styles.primaryBtn} onPress={onClose}>
            <Text style={styles.primaryBtnText}>Compris</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 32,
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#E8472A18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
  sectionTitle: {
    alignSelf: "flex-start",
    fontSize: 13,
    fontWeight: "700",
    color: "#1a1a1a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 4,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
  },
  tierText: {
    flex: 1,
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: "#E8472A",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    alignSelf: "stretch",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
