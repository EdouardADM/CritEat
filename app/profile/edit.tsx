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

// ── Constantes ────────────────────────────────────────────────────────────────

const ACCENT   = "#E8472A";
const MAX_BIO  = 200;
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

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
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  // Pré-remplit le formulaire une fois le profil chargé
  useEffect(() => {
    if (profile) {
      setBio(profile.bio ?? "");
    }
  }, [profile?.id]); // déclenché une seule fois quand profile arrive

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
          bio:        bio.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq("id", userId);
      if (updateError) throw updateError;

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
  const username     = profile?.username ?? "";
  const bioRemaining = MAX_BIO - bio.length;

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

        {/* ── Section username (lecture seule) ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Nom d'utilisateur</Text>
          <View style={styles.usernameRow}>
            <Text style={styles.usernameValue}>{username}</Text>
            <Ionicons name="lock-closed-outline" size={14} color="#9CA3AF" />
          </View>
          <Text style={styles.usernameHint}>Ne peut pas être modifié pour le moment</Text>
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
