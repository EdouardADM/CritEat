import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href?: Href;
  danger?: boolean;
  onPress?: () => void;
};

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, user } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();

  const rows: Row[] = [
    { icon: "person-outline", label: "Modifier le profil", href: "/profile/edit" },
    { icon: "shield-checkmark-outline", label: "Mes données (RGPD)", href: "/data" },
    { icon: "mail-outline", label: "Nous contacter", href: "/contact" },
    { icon: "document-text-outline", label: "Politique de confidentialité", href: "/privacy" },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
        </Pressable>
        <Text style={styles.headerTitle}>Gestion du compte</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {!!user?.email && <Text style={styles.email}>{user.email}</Text>}

        <View style={styles.card}>
          {rows.map((row, i) => (
            <Pressable
              key={row.label}
              style={[styles.row, i < rows.length - 1 && styles.rowBorder]}
              onPress={() => (row.href ? router.push(row.href) : row.onPress?.())}
            >
              <Ionicons name={row.icon} size={20} color="#555" />
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color="#E8472A" />
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </View>
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
  content: { padding: 20, gap: 16 },
  notice: {
    fontSize: 13,
    color: "#2a7a2a",
    fontWeight: "600",
    textAlign: "center",
  },
  email: { fontSize: 13, color: "#888", textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0F0F0",
  },
  rowLabel: { flex: 1, fontSize: 15, color: "#1a1a1a" },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  signOutText: { color: "#E8472A", fontSize: 15, fontWeight: "600" },
});
