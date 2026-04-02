import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const username = user?.user_metadata?.username ?? "Utilisateur";
  const email = user?.email ?? "";

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>
            {username.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.username}>{username}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E8472A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarLetter: {
    fontSize: 34,
    fontWeight: "700",
    color: "#fff",
  },
  username: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  email: {
    fontSize: 14,
    color: "#888",
  },
  section: {
    marginTop: 16,
  },
  signOutBtn: {
    borderWidth: 1.5,
    borderColor: "#E8472A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutText: {
    color: "#E8472A",
    fontSize: 15,
    fontWeight: "600",
  },
});
