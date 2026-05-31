import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import ConsentCheckbox from "../components/ConsentCheckbox";

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Validation côté client pour le confort ; l'enforcement réel reste serveur.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleRegister = async () => {
    setError(null);

    const trimmedEmail = email.trim();
    if (!username.trim()) {
      setError("Le nom d'utilisateur est requis.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Adresse email invalide.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (!consent) {
      setError("Tu dois accepter la politique de confidentialité pour continuer.");
      return;
    }

    setLoading(true);
    try {
      await signUp(trimmedEmail, password, username.trim());
      // Un code de confirmation a été envoyé par email → écran de saisie OTP.
      // (Supabase gère la protection anti-énumération si l'email existe déjà.)
      router.replace({ pathname: "/verify", params: { email: trimmedEmail } });
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      const msg = ((e as Error)?.message ?? "").toLowerCase();

      // Email déjà utilisé → invite à se connecter (login gère le cas non confirmé).
      if (
        code === "user_already_exists" ||
        msg.includes("already registered") ||
        msg.includes("already been registered")
      ) {
        router.replace({
          pathname: "/login",
          params: { notice: "Un compte existe déjà avec cet email. Connecte-toi." },
        });
        return;
      }

      // Message générique : ne révèle pas si un compte existe déjà.
      setError("Inscription impossible pour le moment. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.logo}>CritEat</Text>
      <Text style={styles.title}>Créer un compte</Text>

      <TextInput
        style={styles.input}
        placeholder="Nom d'utilisateur"
        placeholderTextColor="#999"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoComplete="username"
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />

      <ConsentCheckbox checked={consent} onToggle={() => setConsent((v) => !v)} />

      {/* Message d'erreur Supabase ou validation locale */}
      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Créer mon compte</Text>
        )}
      </TouchableOpacity>

      <Link href="/login" style={styles.link}>
        Déjà un compte ? Se connecter
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 12,
  },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    color: "#E8472A",
    textAlign: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1a1a1a",
    backgroundColor: "#fafafa",
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  link: {
    color: "#E8472A",
    textAlign: "center",
    fontSize: 14,
    marginTop: 8,
  },
});
