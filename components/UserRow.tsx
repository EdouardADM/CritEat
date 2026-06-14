import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useFollow } from "../hooks/useFollow";
import { getKarma } from "../constants/karma";
import Avatar from "./Avatar";

export type UserRowItem = {
  id: string;
  username: string;
  avatar_url: string | null;
  karma_tier: string;
  review_count: number;
  is_followed_by_me?: boolean;
};

// Ligne utilisateur réutilisable (Social, listes d'abonnés/abonnements).
// Le corps ouvre le profil ; le bouton Suivre/Suivi est optionnel et géré en
// optimiste local.
export default function UserRow({
  item,
  showFollow = false,
}: {
  item: UserRowItem;
  showFollow?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { toggleFollow, submitting } = useFollow();

  const [following, setFollowing] = useState(!!item.is_followed_by_me);
  useEffect(() => {
    setFollowing(!!item.is_followed_by_me);
  }, [item.is_followed_by_me]);

  const karma = getKarma(item.karma_tier);
  const initials = item.username.slice(0, 2).toUpperCase();
  const isSelf = user?.id === item.id;

  const handleToggle = async () => {
    const previous = following;
    setFollowing(!previous); // optimiste
    try {
      const result = await toggleFollow(item.id, previous);
      setFollowing(result);
    } catch {
      setFollowing(previous); // revert
    }
  };

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.body}
        onPress={() => router.push(`/profile/${item.id}`)}
      >
        <Avatar
          uri={item.avatar_url}
          initials={initials}
          size={46}
          backgroundColor="#F0F0F0"
          textColor="#555"
        />
        <View style={styles.info}>
          <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
          <View style={styles.metaRow}>
            <Ionicons name={karma.icon as any} size={12} color={karma.color} />
            <Text style={[styles.tier, { color: karma.color }]}>{karma.label}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.reviewCount}>{item.review_count} avis</Text>
          </View>
        </View>
      </Pressable>

      {showFollow && !isSelf && (
        <Pressable
          style={[styles.followBtn, following && styles.followBtnActive]}
          onPress={handleToggle}
          disabled={submitting}
          hitSlop={6}
        >
          <Text style={[styles.followText, following && styles.followTextActive]}>
            {following ? "Suivi" : "Suivre"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  username: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tier: {
    fontSize: 12,
    fontWeight: "600",
  },
  dot: {
    fontSize: 12,
    color: "#ccc",
  },
  reviewCount: {
    fontSize: 12,
    color: "#999",
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#E8472A",
  },
  followBtnActive: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E8472A40",
  },
  followText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  followTextActive: {
    color: "#E8472A",
  },
});
