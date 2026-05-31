import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useExportMyData } from "../hooks/useExportMyData";

export default function DataScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, withdrawConsent } = useAuth();
  const { exporting, exportData } = useExportMyData();
  const [busy, setBusy] = useState<null | "withdraw" | "delete">(null);

  const handleExport = async () => {
    try {
      await exportData();
    } catch {
      Alert.alert("Erreur", "L'export n'a pas pu être généré. Réessaie.");
    }
  };

  const handleWithdraw = () => {
    Alert.alert(
      "Retirer le consentement",
      "Tu seras déconnecté. Tes données sont conservées, mais tu devras ré-accepter la politique pour réutiliser l'application.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Retirer",
          style: "destructive",
          onPress: async () => {
            setBusy("withdraw");
            try {
              await withdrawConsent();
              await signOut();
            } catch {
              Alert.alert("Erreur", "Une erreur est survenue. Réessaie.");
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const performDelete = async () => {
    setBusy("delete");
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error || !(data as { ok?: boolean })?.ok) throw new Error("delete_failed");
      await signOut();
    } catch {
      Alert.alert("Erreur", "La suppression a échoué. Réessaie plus tard.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = () => {
    // Double confirmation pour une action irréversible.
    Alert.alert(
      "Supprimer mon compte",
      "Cette action est irréversible. Toutes tes données (avis, photos, votes, listes, profil) seront définitivement effacées, dans un délai maximal de 30 jours.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Continuer",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Dernière confirmation",
              "Confirmes-tu la suppression définitive de ton compte ?",
              [
                { text: "Annuler", style: "cancel" },
                { text: "Supprimer définitivement", style: "destructive", onPress: performDelete },
              ],
            ),
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
        </Pressable>
        <Text style={styles.headerTitle}>Mes données</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Conformément au RGPD, tu contrôles tes données directement depuis cet écran.
        </Text>

        <DataAction
          icon="download-outline"
          title="Exporter mes données"
          subtitle="Accès & portabilité (Art. 15 & 20) — fichier JSON"
          loading={exporting}
          onPress={handleExport}
        />
        <DataAction
          icon="create-outline"
          title="Modifier mes informations"
          subtitle="Rectification (Art. 16)"
          onPress={() => router.push("/profile/edit")}
        />
        <DataAction
          icon="hand-left-outline"
          title="Retirer mon consentement"
          subtitle="Opposition & retrait (Art. 21 & 7.3)"
          loading={busy === "withdraw"}
          onPress={handleWithdraw}
        />
        <DataAction
          icon="trash-outline"
          title="Supprimer mon compte"
          subtitle="Effacement (Art. 17) — irréversible"
          danger
          loading={busy === "delete"}
          onPress={handleDelete}
        />
      </ScrollView>
    </View>
  );
}

function DataAction({
  icon,
  title,
  subtitle,
  onPress,
  danger,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  const color = danger ? "#DC2626" : "#1a1a1a";
  return (
    <Pressable style={styles.action} onPress={onPress} disabled={loading}>
      <Ionicons name={icon} size={22} color={danger ? "#DC2626" : "#555"} />
      <View style={styles.actionText}>
        <Text style={[styles.actionTitle, { color }]}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={danger ? "#DC2626" : "#E8472A"} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#ccc" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  content: { padding: 20, gap: 12 },
  intro: { fontSize: 14, color: "#555", lineHeight: 21, marginBottom: 4 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  actionText: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 15, fontWeight: "600" },
  actionSubtitle: { fontSize: 12, color: "#9CA3AF" },
});
