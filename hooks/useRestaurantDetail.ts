import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ── Types exportés ────────────────────────────────────────────────────────────

export type ReviewDetail = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  karma_tier: string;
  comment: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  review_photos: { url: string; position: number }[];
  score_qp: number | null;
  score_ambiance: number | null;
  score_service: number | null;
  score_food: number | null;
  global_score: number | null;
  upvotes: number;
  downvotes: number;
  my_vote: 1 | -1 | null; // vote de l'utilisateur courant sur cet avis
};

export type RestaurantDetail = {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  postcode: string | null;
  phone: string | null;
  website: string | null;
  opening_hours: Record<string, string> | null;
  description: string | null;
  composite_score: number | null;
  score_qp: number | null;
  score_ambiance: number | null;
  score_service: number | null;
  score_food: number | null;
  review_count: number;
  takeaway: boolean | null;
  delivery: boolean | null;
  outdoor_seating: boolean | null;
  wheelchair: boolean | null;
  diet_options: string[] | null;
  price_range: number | null;
  lat: number | null;
  lng: number | null;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRestaurantDetail(restaurantId: string | null): {
  restaurant: RestaurantDetail | null;
  reviews: ReviewDetail[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [reviews, setReviews] = useState<ReviewDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;

    setLoading(true);
    setError(null);

    try {
      // ── 1. Détail du restaurant (via RPC pour extraire lat/lng depuis geography) ──
      const { data: rpcData, error: restaurantError } = await supabase
        .rpc("get_restaurant_detail", { p_id: restaurantId });

      const restaurantData = rpcData?.[0] ?? null;

      if (restaurantError) throw restaurantError;

      // ── 2. 20 derniers avis avec join sur public.users ───────────────────
      const { data: reviewsData, error: reviewsError } = await supabase
        .from("reviews")
        .select(
          "id, user_id, score_qp, score_ambiance, score_service, score_food, " +
          "global_score, comment, is_verified, created_at, updated_at, upvotes, downvotes, " +
          "review_photos(url, position), users(username, avatar_url, karma_tier)"
        )
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (reviewsError) throw reviewsError;

      // ── 3. Votes de l'utilisateur courant sur ces avis ───────────────────
      const reviewIds = (reviewsData ?? []).map((r: any) => r.id);
      const myVotes: Record<string, 1 | -1> = {};
      const { data: { user } } = await supabase.auth.getUser();
      if (user && reviewIds.length > 0) {
        const { data: votesData } = await supabase
          .from("votes")
          .select("review_id, value")
          .eq("user_id", user.id)
          .in("review_id", reviewIds);
        for (const v of votesData ?? []) {
          myVotes[v.review_id] = v.value as 1 | -1;
        }
      }

      setRestaurant(restaurantData as unknown as RestaurantDetail);

      const mapped: ReviewDetail[] = (reviewsData ?? []).map((row: any) => ({
        id:            row.id,
        user_id:       row.user_id,
        username:      row.users?.username ?? "Utilisateur",
        avatar_url:    row.users?.avatar_url ?? null,
        karma_tier:    row.users?.karma_tier ?? "novice",
        comment:       row.comment,
        is_verified:   row.is_verified ?? false,
        created_at:    row.created_at,
        updated_at:    row.updated_at,
        review_photos: (row.review_photos ?? []).sort(
          (a: { position: number }, b: { position: number }) => a.position - b.position
        ),
        score_qp:      row.score_qp,
        score_ambiance: row.score_ambiance,
        score_service:  row.score_service,
        score_food:     row.score_food,
        global_score:   row.global_score,
        upvotes:        row.upvotes ?? 0,
        downvotes:      row.downvotes ?? 0,
        my_vote:        myVotes[row.id] ?? null,
      }));

      setReviews(mapped);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[useRestaurantDetail] ERREUR :", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { restaurant, reviews, loading, error, refetch: load };
}

// ── Utilitaire : moyenne d'une dimension sur les avis ─────────────────────────

export function avgScore(
  reviews: ReviewDetail[],
  key: keyof Pick<ReviewDetail, "score_qp" | "score_ambiance" | "score_service" | "score_food" | "global_score">
): number | null {
  const values = reviews.map((r) => r[key]).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
