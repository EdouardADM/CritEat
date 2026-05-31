import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CONTACT_EMAIL } from "../constants/legal";

const MAX_SUBJECT = 150;
const MAX_MESSAGE = 5000;

export default function ContactScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Ouvre l'application mail de l'utilisateur avec un brouillon pré-rempli
  // vers la boîte de contact dédiée. Aucun backend requis.
  const handleOpenMail = async () => {
    setError(null);
    const url =
      `mailto:${CONTACT_EMAIL}` +
      `?subject=${encodeURIComponent(subject.trim())}` +
      `&body=${encodeURIComponent(message.trim())}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error("no_mail_app");
      await Linking.openURL(url);
    } catch {
      setError(
        `Impossible d'ouvrir l'application mail. Écris-nous directement à ${CONTACT_EMAIL}.`,
      );
      Alert.alert("Adresse de contact", CONTACT_EMAIL);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
        </Pressable>
        <Text style={styles.headerTitle}>Nous contacter</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Une question, une demande d&apos;assistance ou l&apos;exercice d&apos;un droit RGPD ?
          Écris-nous à l&apos;adresse ci-dessous. Nous répondons dans un délai maximal d&apos;un mois.
        </Text>

        <View style={styles.emailCard}>
          <Ionicons name="mail-outline" size={18} color="#E8472A" />
          <Text style={styles.emailText}>{CONTACT_EMAIL}</Text>
        </View>

        <Text style={styles.label}>Sujet</Text>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Objet de ta demande"
          placeholderTextColor="#9CA3AF"
          maxLength={MAX_SUBJECT}
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={message}
          onChangeText={setMessage}
          placeholder="Décris ta demande…"
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={MAX_MESSAGE}
          textAlignVertical="top"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={handleOpenMail}>
          <Ionicons name="mail-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>Ouvrir mon application mail</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  content: { padding: 20, gap: 8 },
  intro: { fontSize: 14, color: "#555", lineHeight: 21, marginBottom: 8 },
  emailCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF1EF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  emailText: { fontSize: 15, fontWeight: "600", color: "#E8472A" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1a1a1a",
    backgroundColor: "#F9FAFB",
  },
  textarea: { minHeight: 140 },
  error: { color: "#E8472A", fontSize: 13, marginTop: 8 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8472A",
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
