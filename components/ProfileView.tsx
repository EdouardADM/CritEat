import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useUserProfile } from "../hooks/useUserProfile";
import { useFollow } from "../hooks/useFollow";
import KarmaBadge from "./KarmaBadge";
import KarmaInfoModal from "./KarmaInfoModal";
import ProfileMiniMap from "./ProfileMiniMap";

// ── Constantes ────────────────────────────────────────────────────────────────

const ACCENT = "#E8472A";

const CATEGORY_FR: Record<string, string> = {
  french:        "française",
  chinese:       "chinoise",
  italian:       "italienne",
  fast_food:     "fast-food",
  japanese:      "japonaise",
  mediterranean: "méditerranéenne",
  indian:        "indienne",
  mexican:       "mexicaine",
  american:      "américaine",
  belgian:       "belge",
  thai:          "thaïlandaise",
  greek:         "grecque",
  spanish:       "espagnole",
  vietnamese:    "vietnamienne",
  moroccan:      "marocaine",
  turkish:       "turque",
  pizza:         "pizza",
  sushi:         "sushi",
  burger:        "burger",
  seafood:       "fruits de mer",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarColor(username: string): string {
  const palette = [ACCENT, "#3B82F6", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function initials(username: string): string {
  return username
    .split(/[\s._-]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ProfileView({ userId }: { userId: string }) {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { user: authUser, signOut } = useAuth();

  const { profile, loading, error, refetch } = useUserProfile(userId);
  const { toggleFollow, submitting } = useFollow();

  const [infoVisible, setInfoVisible] = useState(false);
  const [following, setFollowing] = useState(false);

  // Rafraîchit le profil chaque fois que l'écran reprend le focus (ex. retour
  // de l'écran d'édition) → bio/avatar/username à jour sans relancer l'app.
  // On saute le tout premier focus : le fetch initial est déjà fait au montage.
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch])
  );

  // Synchronise l'état de suivi optimiste avec la donnée serveur.
  useEffect(() => {
    if (profile) setFollowing(profile.is_followed_by_me);
  }, [profile?.is_followed_by_me]);

  const isSelf = authUser?.id === userId;

  const handleToggleFollow = async () => {
    const previous = following;
    setFollowing(!previous); // optimiste
    try {
      await toggleFollow(userId, previous);
      refetch(); // met à jour follower_count côté serveur
    } catch {
      setFollowing(previous); // revert
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !profile) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={44} color={ACCENT} />
        <Text style={styles.errorTitle}>
          {error ? "Impossible de charger le profil" : "Profil introuvable"}
        </Text>
        {error && (
          <Pressable style={styles.retryBtn} onPress={refetch}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const catLabel = profile.favorite_category
    ? CATEGORY_FR[profile.favorite_category] ?? profile.favorite_category
    : null;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Avatar + identité ─────────────────────────────────────────────── */}
      <View style={styles.headerBlock}>
        {profile.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: avatarColor(profile.username) }]}>
            <Text style={styles.avatarInitials}>{initials(profile.username)}</Text>
          </View>
        )}

        <Text style={styles.username}>{profile.username}</Text>

        {/* Karma tier badge + info */}
        <View style={styles.karmaRow}>
          <KarmaBadge tier={profile.karma_tier} />
          <Pressable
            onPress={() => setInfoVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="information-circle-outline" size={20} color="#9CA3AF" />
          </Pressable>
        </View>

        {/* Bio */}
        <Text
          style={profile.bio ? styles.bio : styles.bioEmpty}
          numberOfLines={3}
        >
          {profile.bio ?? "Aucune bio"}
        </Text>
      </View>

      {/* ── Stats 4 colonnes ──────────────────────────────────────────────── */}
      <View style={styles.statsCard}>
        {[
          { value: String(Math.round(profile.karma_score)), label: "Karma"   },
          { value: String(profile.review_count),   label: "Avis"    },
          { value: String(profile.unique_restaurants_count), label: "Restos" },
          { value: String(profile.total_photos_count),       label: "Photos" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.statCol, i < arr.length - 1 && styles.statColBorder]}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Followers / Following (cliquables) ────────────────────────────── */}
      <View style={styles.followRow}>
        <Pressable
          onPress={() =>
            router.push({ pathname: "/follows", params: { userId, mode: "followers" } })
          }
          hitSlop={8}
        >
          <Text style={styles.followText}>
            <Text style={styles.followCount}>{profile.follower_count}</Text>
            {" abonnés"}
          </Text>
        </Pressable>
        <View style={styles.followDot} />
        <Pressable
          onPress={() =>
            router.push({ pathname: "/follows", params: { userId, mode: "following" } })
          }
          hitSlop={8}
        >
          <Text style={styles.followText}>
            <Text style={styles.followCount}>{profile.following_count}</Text>
            {" abonnements"}
          </Text>
        </Pressable>
      </View>

      {/* ── Catégorie préférée ────────────────────────────────────────────── */}
      {catLabel && (
        <View style={styles.favCatBadge}>
          <Ionicons name="restaurant-outline" size={14} color={ACCENT} />
          <Text style={styles.favCatText}>Adepte de cuisine {catLabel}</Text>
        </View>
      )}

      {/* ── Carte des restos notés ────────────────────────────────────────── */}
      <ProfileMiniMap userId={userId} />

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <View style={styles.actions}>
        {isSelf ? (
          <>
            <Pressable
              style={styles.btnPrimary}
              onPress={() => router.push("/profile/edit")}
            >
              <Ionicons name="pencil-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.btnPrimaryText}>Modifier mon profil</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={() => router.push("/data")}>
              <Ionicons name="shield-checkmark-outline" size={16} color={ACCENT} style={{ marginRight: 6 }} />
              <Text style={styles.btnSecondaryText}>Mes données</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary} onPress={() => router.push("/account")}>
              <Ionicons name="settings-outline" size={16} color={ACCENT} style={{ marginRight: 6 }} />
              <Text style={styles.btnSecondaryText}>Gestion du compte</Text>
            </Pressable>
            <Pressable style={styles.btnSignOut} onPress={signOut}>
              <Text style={styles.btnSignOutText}>Se déconnecter</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.btnFollow, following && styles.btnFollowActive]}
            onPress={handleToggleFollow}
            disabled={submitting}
          >
            <Ionicons
              name={following ? "checkmark" : "person-add-outline"}
              size={16}
              color={following ? ACCENT : "#fff"}
              style={{ marginRight: 6 }}
            />
            <Text style={[
              styles.btnFollowText,
              following && styles.btnFollowTextActive,
            ]}>
              {following ? "Suivi" : "Suivre"}
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>

    <KarmaInfoModal visible={infoVisible} onClose={() => setInfoVisible(false)} />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    gap: 12,
    paddingHorizontal: 24,
  },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  headerBlock: {
    alignItems: "center",
    paddingBottom: 24,
    gap: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarInitials: {
    fontSize: 34,
    fontWeight: "700",
    color: "#fff",
  },
  username: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  karmaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bio: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  bioEmpty: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    fontStyle: "italic",
  },

  // ── Stats ──────────────────────────────────────────────────────────────────
  statsCard: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statColBorder: {
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  statLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "500",
  },

  // ── Follow ─────────────────────────────────────────────────────────────────
  followRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  followText: {
    fontSize: 14,
    color: "#6B7280",
  },
  followCount: {
    fontWeight: "700",
    color: "#1a1a1a",
  },
  followDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },

  // ── Catégorie préférée ─────────────────────────────────────────────────────
  favCatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: ACCENT + "12",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  favCatText: {
    fontSize: 13,
    fontWeight: "600",
    color: ACCENT,
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  actions: {
    gap: 12,
    marginTop: 20,
  },
  btnPrimary: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  btnSecondary: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: ACCENT + "40",
  },
  btnSecondaryText: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: "600",
  },
  btnSignOut: {
    alignItems: "center",
    paddingVertical: 10,
  },
  btnSignOutText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  btnFollow: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnFollowActive: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: ACCENT,
  },
  btnFollowText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  btnFollowTextActive: {
    color: ACCENT,
  },
});
