import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFollowList, type FollowMode } from "../hooks/useFollowList";
import UserRow from "../components/UserRow";

export default function FollowsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId, mode: modeParam } = useLocalSearchParams<{
    userId?: string;
    mode?: string;
  }>();
  const mode: FollowMode = modeParam === "following" ? "following" : "followers";

  const { users, loading, error } = useFollowList(userId ?? "", mode);

  const title = mode === "followers" ? "Abonnés" : "Abonnements";
  const emptyText =
    mode === "followers" ? "Aucun abonné pour l'instant" : "Aucun abonnement pour l'instant";

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.backBtn} />
      </View>

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
          renderItem={({ item }) => <UserRow item={item} showFollow />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  errorText: { color: "#E8472A", fontSize: 14 },
  emptyText: { color: "#aaa", fontSize: 14 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#F0F0F0",
    marginLeft: 80,
  },
});
