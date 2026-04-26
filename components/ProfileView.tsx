import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useUserProfile } from "../hooks/useUserProfile";

// ── Constantes ────────────────────────────────────────────────────────────────

const ACCENT = "#E8472A";

const KARMA_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  novice:            { label: "Novice",            color: "#9CA3AF", icon: "leaf-outline"    },
  confirmed_critic:  { label: "Critique confirmé", color: "#3B82F6", icon: "ribbon-outline"  },
  local_expert:      { label: "Expert local",      color: "#F59E0B", icon: "trophy-outline"  },
};

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

  const isSelf = authUser?.id === userId;

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

  const karma = KARMA_CONFIG[profile.karma_tier] ?? KARMA_CONFIG.novice;
  const catLabel = profile.favorite_category
    ? CATEGORY_FR[profile.favorite_category] ?? profile.favorite_category
    : null;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
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

        {/* Karma tier badge */}
        <View style={[styles.karmaBadge, { backgroundColor: karma.color + "18", borderColor: karma.color + "40" }]}>
          <Ionicons name={karma.icon as any} size={13} color={karma.color} />
          <Text style={[styles.karmaBadgeText, { color: karma.color }]}>{karma.label}</Text>
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
          { value: profile.karma_score.toFixed(1), label: "Karma"   },
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

      {/* ── Followers / Following ─────────────────────────────────────────── */}
      <View style={styles.followRow}>
        <Text style={styles.followText}>
          <Text style={styles.followCount}>{profile.follower_count}</Text>
          {" abonnés"}
        </Text>
        <View style={styles.followDot} />
        <Text style={styles.followText}>
          <Text style={styles.followCount}>{profile.following_count}</Text>
          {" abonnements"}
        </Text>
      </View>

      {/* ── Catégorie préférée ────────────────────────────────────────────── */}
      {catLabel && (
        <View style={styles.favCatBadge}>
          <Ionicons name="restaurant-outline" size={14} color={ACCENT} />
          <Text style={styles.favCatText}>Adepte de cuisine {catLabel}</Text>
        </View>
      )}

      {/* ── Mini-map (placeholder Phase D) ───────────────────────────────── */}
      {/* TODO Phase D — mini-map des restos visités */}
      <View style={styles.placeholder}>
        <Ionicons name="map-outline" size={28} color="#D1D5DB" />
        <Text style={styles.placeholderText}>Carte des restos visités</Text>
      </View>

      {/* ── Activité récente (placeholder Phase D) ───────────────────────── */}
      {/* TODO Phase D — liste des avis récents */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activité récente</Text>
        <Text style={styles.placeholderText}>Avis récents à venir</Text>
      </View>

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
            <Pressable style={styles.btnSignOut} onPress={signOut}>
              <Text style={styles.btnSignOutText}>Se déconnecter</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[
              styles.btnFollow,
              profile.is_followed_by_me && styles.btnFollowActive,
            ]}
            onPress={() => {}}
          >
            <Ionicons
              name={profile.is_followed_by_me ? "checkmark" : "person-add-outline"}
              size={16}
              color={profile.is_followed_by_me ? ACCENT : "#fff"}
              style={{ marginRight: 6 }}
            />
            <Text style={[
              styles.btnFollowText,
              profile.is_followed_by_me && styles.btnFollowTextActive,
            ]}>
              {profile.is_followed_by_me ? "Suivi" : "Suivre"}
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
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
  karmaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  karmaBadgeText: {
    fontSize: 12,
    fontWeight: "600",
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

  // ── Placeholder ────────────────────────────────────────────────────────────
  placeholder: {
    height: 200,
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  actions: {
    gap: 12,
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
