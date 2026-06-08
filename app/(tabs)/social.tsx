import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUserList } from "../../hooks/useUserList";
import { useUserSearch } from "../../hooks/useUserSearch";
import UserRow from "../../components/UserRow";
import SearchBar from "../../components/SearchBar";

// ── Écran ─────────────────────────────────────────────────────────────────────

export default function SocialTab() {
  const insets = useSafeAreaInsets();
  const { users, loading, error } = useUserList();

  const [query, setQuery] = useState("");
  const { results, loading: searching } = useUserSearch(query);

  // Mode recherche actif dès 2 caractères ; sinon liste « Critiqueurs actifs ».
  const searchActive = query.trim().length >= 2;
  const data = searchActive ? results : users;
  const isLoading = searchActive ? searching : loading;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Communauté</Text>
        <Text style={styles.subtitle}>
          {searchActive ? "Résultats de recherche" : "Critiqueurs actifs"}
        </Text>
        <View style={styles.searchWrapper}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            onClear={() => {
              setQuery("");
              Keyboard.dismiss();
            }}
            isLoading={searching}
          />
        </View>
      </View>

      {/* Contenu */}
      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#E8472A" />
        </View>
      )}

      {!searchActive && error && !isLoading && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!isLoading && !(!searchActive && error) && (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow item={item} showFollow />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                {searchActive
                  ? "Aucun utilisateur trouvé"
                  : "Aucun utilisateur pour l'instant"}
              </Text>
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
  searchWrapper: {
    marginTop: 14,
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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#F0F0F0",
    marginLeft: 80,
  },
});
