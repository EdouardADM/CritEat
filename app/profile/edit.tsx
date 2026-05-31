import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useUserProfile } from "../../hooks/useUserProfile";
import { CATEGORY_CONFIG, type RestaurantCategory } from "../../constants/categories";

// ── Constantes ────────────────────────────────────────────────────────────────

const ACCENT   = "#E8472A";
const MAX_BIO  = 200;
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOOD_PREF_KEYS = Object.keys(CATEGORY_CONFIG) as RestaurantCategory[];

// ── Helpers (pattern identique à usePublishReview) ────────────────────────────

function decodeBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function avatarColor(username: string): string {
  const palette = [ACCENT, "#3B82F6", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function initials(username: string): string {
  return username.split(/[\s._-]+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuth();
  const userId = authUser?.id ?? "";

  const { profile, loading: profileLoading } = useUserProfile(userId);

  // ── State formulaire ─────────────────────────────────────────────────────
  const [bio, setBio]             = useState("");
  const [username, setUsername]   = useState("");
  const [foodPrefs, setFoodPrefs] = useState<string[]>([]);
  const [newEmail, setNewEmail]   = useState("");
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  // Pré-remplit le formulaire une fois le profil chargé
  useEffect(() => {
    if (profile) {
      setBio(profile.bio ?? "");
      setUsername(profile.username ?? "");
    }
  }, [profile?.id]); // déclenché une seule fois quand profile arrive

  // food_preferences n'est pas exposé par useUserProfile → lecture dédiée.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("users")
      .select("food_preferences")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data?.food_preferences)) {
          setFoodPrefs(data!.food_preferences as string[]);
        }
      });
    return () => { cancelled = true; };
  }, [userId]);

  const toggleFoodPref = (key: string) => {
    setFoodPrefs((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  // ── Changement d'email (déclenche une re-vérification OTP) ────────────────
  const handleChangeEmail = async () => {
    const trimmed = newEmail.trim();
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert("Email invalide", "Saisis une adresse email valide.");
      return;
    }
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      // Un code est envoyé à la nouvelle adresse → écran OTP en mode email_change.
      router.push({
        pathname: "/verify",
        params: {
          email: trimmed,
          type: "email_change",
          notice: "Saisis le code envoyé à ta nouvelle adresse pour confirmer le changement.",
        },
      });
    } catch {
      Alert.alert("Erreur", "Impossible de modifier l'email pour le moment.");
    } finally {
      setEmailSaving(false);
    }
  };

  // ── Sélection image ──────────────────────────────────────────────────────
  const handlePickAvatar = () => {
    Alert.alert("Changer la photo", "Choisir depuis…", [
      {
        text: "Caméra",
        onPress: () => pickAvatar("camera"),
      },
      {
        text: "Bibliothèque",
        onPress: () => pickAvatar("library"),
      },
      { text: "Annuler", style: "cancel" },
    ]);
  };

  const pickAvatar = async (source: "camera" | "library") => {
    let result: ImagePicker.ImagePickerResult;

    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "L'accès à la caméra est requis.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "L'accès à la galerie est requis.");
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    }

    if (!result.canceled && result.assets[0]) {
      setNewAvatarUri(result.assets[0].uri);
    }
  };

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!userId) return;
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      Alert.alert("Nom requis", "Le nom d'utilisateur ne peut pas être vide.");
      return;
    }
    setSaving(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;

      // 1. Upload nouvel avatar si sélectionné
      if (newAvatarUri) {
        const base64 = await FileSystem.readAsStringAsync(newAvatarUri, {
          encoding: "base64",
        });
        const bytes = decodeBase64(base64);

        if (bytes.byteLength > MAX_SIZE) {
          Alert.alert("Image trop lourde", "La photo ne doit pas dépasser 2 MB.");
          setSaving(false);
          return;
        }

        const storagePath = `${userId}/avatar.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(storagePath, bytes, {
            contentType: "image/jpeg",
            upsert: true, // écrase l'ancien avatar
          });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(storagePath);

        // Cache buster pour forcer le rechargement si l'URL est identique
        avatarUrl = `${publicUrl}?v=${Date.now()}`;
      }

      // 2. UPDATE users
      const { error: updateError } = await supabase
        .from("users")
        .update({
          username:         trimmedUsername,
          bio:              bio.trim() || null,
          avatar_url:       avatarUrl,
          food_preferences: foodPrefs,
        })
        .eq("id", userId);
      if (updateError) {
        // Violation de contrainte d'unicité sur username.
        if ((updateError as { code?: string }).code === "23505") {
          Alert.alert("Nom déjà pris", "Ce nom d'utilisateur est déjà utilisé.");
          setSaving(false);
          return;
        }
        throw updateError;
      }

      Alert.alert("Profil mis à jour", "Vos modifications ont été enregistrées.");
      router.back();
    } catch (e) {
      Alert.alert(
        "Erreur",
        e instanceof Error ? e.message : "Une erreur est survenue."
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Chargement initial ───────────────────────────────────────────────────
  if (profileLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  const displayUri   = newAvatarUri ?? profile?.avatar_url ?? null;
  const bioRemaining = MAX_BIO - bio.length;
  const currentEmail = authUser?.email ?? "";

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerSide}
          hitSlop={10}
        >
          <Text style={styles.headerCancel}>Annuler</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Modifier le profil</Text>

        <Pressable
          onPress={handleSave}
          style={styles.headerSide}
          disabled={saving}
          hitSlop={10}
        >
          {saving ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Text style={styles.headerSave}>Enregistrer</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section avatar ────────────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickAvatar} style={styles.avatarWrapper}>
            {displayUri ? (
              <Image source={{ uri: displayUri }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarImg, { backgroundColor: avatarColor(username) }]}>
                <Text style={styles.avatarInitials}>{initials(username)}</Text>
              </View>
            )}
            {/* Overlay caméra */}
            <View style={styles.avatarOverlay}>
              <Ionicons name="camera" size={22} color="#fff" />
            </View>
          </Pressable>
          <Pressable onPress={handlePickAvatar}>
            <Text style={styles.changePhotoLink}>Changer la photo</Text>
          </Pressable>
        </View>

        {/* ── Section bio ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Bio</Text>
          <TextInput
            style={styles.bioInput}
            value={bio}
            onChangeText={setBio}
            placeholder="Présente-toi en quelques mots..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={MAX_BIO}
            textAlignVertical="top"
          />
          <Text style={[styles.bioCounter, bioRemaining === 0 && styles.bioCounterMax]}>
            {bio.length} / {MAX_BIO}
          </Text>
        </View>

        {/* ── Section username ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Nom d'utilisateur</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Nom d'utilisateur"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            maxLength={30}
          />
        </View>

        {/* ── Section préférences alimentaires ──────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Préférences alimentaires</Text>
          <View style={styles.chipsWrap}>
            {FOOD_PREF_KEYS.map((key) => {
              const selected = foodPrefs.includes(key);
              const cfg = CATEGORY_CONFIG[key];
              return (
                <Pressable
                  key={key}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleFoodPref(key)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {cfg.emoji} {cfg.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Section email ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Email</Text>
          <Text style={styles.currentEmail}>Actuel : {currentEmail}</Text>
          <TextInput
            style={styles.input}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="Nouvelle adresse email"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Pressable
            style={[styles.emailBtn, (emailSaving || !newEmail.trim()) && styles.emailBtnDisabled]}
            onPress={handleChangeEmail}
            disabled={emailSaving || !newEmail.trim()}
          >
            {emailSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.emailBtnText}>Modifier l'email (re-vérification)</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerSide: {
    width: 80,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  headerCancel: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "500",
  },
  headerSave: {
    fontSize: 15,
    color: ACCENT,
    fontWeight: "700",
    textAlign: "right",
  },

  // ── Contenu ────────────────────────────────────────────────────────────────
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 24,
  },

  // ── Avatar ─────────────────────────────────────────────────────────────────
  avatarSection: {
    alignItems: "center",
    gap: 10,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 42,
    fontWeight: "700",
    color: "#fff",
  },
  avatarOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  changePhotoLink: {
    fontSize: 14,
    color: ACCENT,
    fontWeight: "600",
  },

  // ── Sections ───────────────────────────────────────────────────────────────
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 2,
  },

  // ── Bio ────────────────────────────────────────────────────────────────────
  bioInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    fontSize: 14,
    color: "#1a1a1a",
    minHeight: 100,
    lineHeight: 20,
  },
  bioCounter: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "right",
  },
  bioCounterMax: {
    color: ACCENT,
  },

  // ── Champs texte génériques ──────────────────────────────────────────────
  input: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1a1a1a",
  },

  // ── Préférences (chips) ───────────────────────────────────────────────────
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#F9FAFB",
  },
  chipSelected: {
    borderColor: ACCENT,
    backgroundColor: ACCENT + "14",
  },
  chipText: {
    fontSize: 13,
    color: "#555",
  },
  chipTextSelected: {
    color: ACCENT,
    fontWeight: "600",
  },

  // ── Email ─────────────────────────────────────────────────────────────────
  currentEmail: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  emailBtn: {
    marginTop: 8,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  emailBtnDisabled: {
    opacity: 0.5,
  },
  emailBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  // ── Username ───────────────────────────────────────────────────────────────
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },
  usernameValue: {
    flex: 1,
    fontSize: 14,
    color: "#9CA3AF",
  },
  usernameHint: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
});
