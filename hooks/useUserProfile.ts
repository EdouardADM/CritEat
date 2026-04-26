import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  karma_score: number;
  karma_tier: string;
  review_count: number;
  follower_count: number;
  following_count: number;
  created_at: string;
  // Calculés côté client
  unique_restaurants_count: number;
  total_photos_count: number;
  favorite_category: string | null;
  // Uniquement pertinent quand on consulte le profil de quelqu'un d'autre
  is_followed_by_me: boolean;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useUserProfile(userId: string): {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = useCallback(() => setFetchTick((n) => n + 1), []);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // ── 1. Utilisateur connecté ──────────────────────────────────────────
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const isSelf = authUser?.id === userId;

        // ── 2. Données de base depuis public.users ───────────────────────────
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select(
            "id, username, avatar_url, bio, karma_score, karma_tier, " +
            "review_count, follower_count, following_count, created_at"
          )
          .eq("id", userId)
          .single();
        if (userError || !userData) throw userError ?? new Error("Profil introuvable");
        const user = userData as any;

        // ── 3. Reviews avec catégorie restaurant ─────────────────────────────
        const { data: reviewsData, error: reviewsError } = await supabase
          .from("reviews")
          .select("id, restaurant_id, restaurants(category)")
          .eq("user_id", userId);
        if (reviewsError) throw reviewsError;

        const reviews = reviewsData ?? [];

        // Restaurants uniques
        const uniqueIds = new Set(reviews.map((r: any) => r.restaurant_id));
        const unique_restaurants_count = uniqueIds.size;

        // Catégorie favorite : la plus fréquente
        const catCounts: Record<string, number> = {};
        for (const r of reviews) {
          const cat = (r.restaurants as any)?.category;
          if (cat) catCounts[cat] = (catCounts[cat] ?? 0) + 1;
        }
        const favorite_category =
          Object.keys(catCounts).length > 0
            ? Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0]
            : null;

        // ── 4. Nombre total de photos ────────────────────────────────────────
        let total_photos_count = 0;
        const reviewIds = reviews.map((r: any) => r.id as string);
        if (reviewIds.length > 0) {
          const { count, error: photosError } = await supabase
            .from("review_photos")
            .select("*", { count: "exact", head: true })
            .in("review_id", reviewIds);
          if (!photosError) total_photos_count = count ?? 0;
        }

        // ── 5. is_followed_by_me ─────────────────────────────────────────────
        let is_followed_by_me = false;
        if (!isSelf && authUser) {
          const { data: followRow } = await supabase
            .from("follows")
            .select("follower_id")
            .eq("follower_id", authUser.id)
            .eq("following_id", userId)
            .maybeSingle();
          is_followed_by_me = followRow !== null;
        }

        if (!cancelled) {
          setProfile({
            id:                      user.id,
            username:                user.username,
            avatar_url:              user.avatar_url ?? null,
            bio:                     user.bio ?? null,
            karma_score:             user.karma_score ?? 0,
            karma_tier:              user.karma_tier ?? "novice",
            review_count:            user.review_count ?? 0,
            follower_count:          user.follower_count ?? 0,
            following_count:         user.following_count ?? 0,
            created_at:              user.created_at,
            unique_restaurants_count,
            total_photos_count,
            favorite_category,
            is_followed_by_me,
          });
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, fetchTick]);

  return { profile, loading, error, refetch };
}
