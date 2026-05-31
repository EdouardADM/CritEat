import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth, type OtpType } from "../context/AuthContext";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60; // secondes

// Mappe une erreur Supabase vers un message FR générique (sans détail exploitable).
function messageForError(e: unknown): string {
  const err = e as { status?: number; code?: string; message?: string; name?: string };
  const status = err?.status;
  const code = err?.code ?? "";
  const raw = (err?.message ?? "").toLowerCase();

  // Réseau : pas de réponse serveur.
  if (
    err?.name === "TypeError" ||
    raw.includes("network") ||
    raw.includes("failed to fetch") ||
    raw.includes("fetch")
  ) {
    return "Pas de connexion. Vérifie ton réseau et réessaie.";
  }
  // Trop de tentatives / rate limit.
  if (status === 429 || code.includes("rate") || raw.includes("rate limit")) {
    return "Trop de tentatives. Réessaie dans quelques instants.";
  }
  // Code invalide ou expiré.
  if (
    status === 401 ||
    status === 403 ||
    raw.includes("invalid") ||
    raw.includes("expired") ||
    raw.includes("token")
  ) {
    return "Code invalide ou expiré. Vérifie-le ou demande un nouveau code.";
  }
  return "Une erreur est survenue. Réessaie.";
}

export default function VerifyScreen() {
  const { verifyOtp, resendCode } = useAuth();
  const router = useRouter();
  const {
    email: emailParam,
    notice,
    type: typeParam,
  } = useLocalSearchParams<{ email?: string; notice?: string; type?: string }>();
  const email = (emailParam ?? "").trim();
  const otpType: OtpType = typeParam === "email_change" ? "email_change" : "signup";

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // Un code vient d'être envoyé à l'arrivée → démarre le cooldown.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  const inputs = useRef<(TextInput | null)[]>([]);

  // Décrémente le compte à rebours chaque seconde.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const code = digits.join("");

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || loading) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await verifyOtp(email, value, otpType);
      if (otpType === "email_change") {
        // Email mis à jour : retour à la gestion du compte.
        router.replace({
          pathname: "/account",
          params: { notice: "Ton adresse email a été mise à jour." },
        });
      }
      // signup : la session s'ouvre et _layout redirige automatiquement vers l'app.
    } catch (e) {
      setError(messageForError(e));
      setDigits(Array(CODE_LENGTH).fill(""));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/\D/g, "");
    if (cleaned.length === 0) {
      // Effacement de la case courante.
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    // Collage / saisie multiple : répartit les chiffres à partir de l'index courant.
    const next = [...digits];
    let cursor = index;
    for (const ch of cleaned) {
      if (cursor >= CODE_LENGTH) break;
      next[cursor] = ch;
      cursor++;
    }
    setDigits(next);

    const lastFilled = Math.min(cursor, CODE_LENGTH - 1);
    inputs.current[lastFilled]?.focus();

    const assembled = next.join("");
    if (assembled.length === CODE_LENGTH) {
      void submit(assembled);
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    // Recule sur Backspace quand la case est déjà vide.
    if (e.nativeEvent.key === "Backspace" && digits[index] === "" && index > 0) {
      inputs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await resendCode(email, otpType);
      setInfo("Un nouveau code a été envoyé.");
      setCooldown(RESEND_COOLDOWN);
    } catch (e) {
      setError(messageForError(e));
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.logo}>CritEat</Text>
      <Text style={styles.title}>Vérification</Text>
      <Text style={styles.subtitle}>
        Saisis le code à 6 chiffres reçu par email{email ? ` à ${email}` : ""}.
      </Text>

      {/* 6 cases */}
      <View style={styles.codeRow}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <TextInput
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            style={[styles.codeBox, digits[i] !== "" && styles.codeBoxFilled]}
            value={digits[i]}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={(e) => handleKeyPress(e, i)}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH} // permet le collage du code complet
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus={i === 0}
            returnKeyType="done"
            editable={!loading}
          />
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {info && <Text style={styles.info}>{info}</Text>}

      <TouchableOpacity
        style={[styles.button, (loading || code.length !== CODE_LENGTH) && styles.buttonDisabled]}
        onPress={() => submit(code)}
        disabled={loading || code.length !== CODE_LENGTH}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Vérifier</Text>
        )}
      </TouchableOpacity>

      {/* Renvoi avec cooldown */}
      <TouchableOpacity
        onPress={handleResend}
        disabled={cooldown > 0 || resending}
        style={styles.resendBtn}
      >
        <Text style={[styles.resend, (cooldown > 0 || resending) && styles.resendDisabled]}>
          {resending
            ? "Envoi en cours…"
            : cooldown > 0
              ? `Renvoyer le code (${cooldown}s)`
              : "Renvoyer le code"}
        </Text>
      </TouchableOpacity>

      <Link href="/register" style={styles.link}>
        Modifier l&apos;adresse email
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
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 8,
  },
  codeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginVertical: 8,
  },
  codeBox: {
    width: 46,
    height: 56,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    backgroundColor: "#fafafa",
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  codeBoxFilled: {
    borderColor: "#E8472A",
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
  resendBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  resend: {
    color: "#E8472A",
    fontSize: 14,
    fontWeight: "600",
  },
  resendDisabled: {
    color: "#aaa",
  },
  link: {
    color: "#E8472A",
    textAlign: "center",
    fontSize: 14,
    marginTop: 4,
  },
});
