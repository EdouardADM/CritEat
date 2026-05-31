import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import ConsentCheckbox from "../components/ConsentCheckbox";

// Écran de (ré)acceptation du consentement — affiché par le gate de _layout.tsx
// quand une session existe sans consentement valide (session persistée, ancien
// compte, ou nouvelle version de la politique).
export default function ConsentScreen() {
  const { recordConsent, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (!consent) {
      setError("Tu dois accepter la politique pour continuer.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await recordConsent();
      // Le gate _layout redirige automatiquement vers l'app une fois le consentement à jour.
    } catch {
      setError("Une erreur est survenue. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.logo}>CritEat</Text>
      <Text style={styles.title}>Avant de continuer</Text>
      <Text style={styles.body}>
        Pour utiliser CritEat, tu dois accepter notre politique de confidentialité.
        Elle explique quelles données nous traitons, pourquoi, et comment exercer tes droits.
      </Text>

      <ConsentCheckbox checked={consent} onToggle={() => setConsent((v) => !v)} />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, (loading || !consent) && styles.buttonDisabled]}
        onPress={handleAccept}
        disabled={loading || !consent}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Accepter et continuer</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Se déconnecter</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { paddingHorizontal: 24, gap: 16 },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    color: "#E8472A",
    textAlign: "center",
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
  error: {
    color: "#E8472A",
    fontSize: 13,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#E8472A",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  signOutBtn: { alignItems: "center", paddingVertical: 8 },
  signOutText: { color: "#888", fontSize: 14 },
});
