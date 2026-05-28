import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useUserList, type UserListItem } from "../../hooks/useUserList";

// ── Karma tier ────────────────────────────────────────────────────────────────

const KARMA_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  novice:           { label: "Novice",            color: "#9CA3AF", icon: "leaf-outline"   },
  confirmed_critic: { label: "Critique confirmé", color: "#3B82F6", icon: "ribbon-outline" },
  local_expert:     { label: "Expert local",      color: "#F59E0B", icon: "trophy-outline" },
};

// ── Composant ligne utilisateur ───────────────────────────────────────────────

function UserRow({ item }: { item: UserListItem }) {
  const karma = KARMA_CONFIG[item.karma_tier] ?? KARMA_CONFIG.novice;
  const initials = item.username.slice(0, 2).toUpperCase();

  return (
    <View style={styles.row}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {/* Infos */}
      <View style={styles.info}>
        <Text style={styles.username}>{item.username}</Text>
        <View style={styles.metaRow}>
          <Ionicons name={karma.icon as any} size={12} color={karma.color} />
          <Text style={[styles.tier, { color: karma.color }]}>{karma.label}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.reviewCount}>
            {item.review_count} avis
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Écran ─────────────────────────────────────────────────────────────────────

export default function SocialTab() {
  const insets = useSafeAreaInsets();
  const { users, loading, error } = useUserList();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Communauté</Text>
        <Text style={styles.subtitle}>Critiqueurs actifs</Text>
      </View>

      {/* Contenu */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#E8472A" />
        </View>
      )}

      {error && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow item={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Aucun utilisateur pour l'instant</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5E5",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1a1a1a",
  },
  subtitle: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  errorText: {
    color: "#E8472A",
    fontSize: 14,
  },
  emptyText: {
    color: "#aaa",
    fontSize: 14,
  },

  // ── Ligne ─────────────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#555",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  username: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tier: {
    fontSize: 12,
    fontWeight: "600",
  },
  dot: {
    fontSize: 12,
    color: "#ccc",
  },
  reviewCount: {
    fontSize: 12,
    color: "#999",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#F0F0F0",
    marginLeft: 80,
  },
});
