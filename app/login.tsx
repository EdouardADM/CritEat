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
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import ConsentCheckbox from "../components/ConsentCheckbox";

export default function LoginScreen() {
  const { signIn, resendSignupCode, recordConsent } = useAuth();
  const router = useRouter();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Message d'arrivée (ex. redirection depuis l'inscription d'un email déjà pris).
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setInfo(null);
    if (!consent) {
      setError("Tu dois accepter la politique de confidentialité pour continuer.");
      return;
    }
    const trimmedEmail = email.trim();
    setLoading(true);
    try {
      await signIn(trimmedEmail, password);
      // Consentement explicite horodaté à chaque connexion.
      try {
        await recordConsent();
      } catch {
        // Non bloquant : la session est ouverte ; le gate _layout couvrira si besoin.
      }
      // La redirection vers "/" est gérée automatiquement par _layout.tsx
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      const msg = ((e as Error)?.message ?? "").toLowerCase();

      // Compte existant mais email non confirmé → renvoie un code et bascule vers l'OTP.
      if (code === "email_not_confirmed" || msg.includes("not confirmed")) {
        try {
          await resendSignupCode(trimmedEmail);
        } catch {
          // Ne bloque pas la navigation (ex. rate limit) : l'écran OTP gère le renvoi.
        }
        router.replace({
          pathname: "/verify",
          params: {
            email: trimmedEmail,
            notice:
              "Ton compte n'est pas encore confirmé, on vient de t'envoyer un nouveau code.",
          },
        });
        return;
      }

      // Message générique : ne révèle pas si l'email existe.
      setError("Email ou mot de passe incorrect.");
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
      <Text style={styles.title}>Connexion</Text>

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
        autoComplete="password"
      />

      <ConsentCheckbox checked={consent} onToggle={() => setConsent((v) => !v)} />

      {/* Message d'information (redirection) */}
      {info && <Text style={styles.info}>{info}</Text>}

      {/* Message d'erreur */}
      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Se connecter</Text>
        )}
      </TouchableOpacity>

      <Link href="/register" style={styles.link}>
        Pas encore de compte ? S'inscrire
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
  info: {
    color: "#2a7a2a",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "600",
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
