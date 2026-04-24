import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ── Types exportés ────────────────────────────────────────────────────────────

export type ReviewDetail = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
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
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRestaurantDetail(restaurantId: string | null): {
  restaurant: RestaurantDetail | null;
  reviews: ReviewDetail[];
  loading: boolean;
  error: string | null;
} {
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [reviews, setReviews] = useState<ReviewDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      console.log("[useRestaurantDetail] restaurantId reçu :", restaurantId);

      try {
        // ── Sanity check : 3 premières lignes de la table ────────────────────
        const { data: sampleData, error: sampleError } = await supabase
          .from("restaurants")
          .select("id, name")
          .limit(3);
        console.log("[useRestaurantDetail] sample restaurants →", sampleData, "err →", sampleError);

        // ── 1. Détail du restaurant ──────────────────────────────────────────
        const restaurantQuery = supabase
          .from("restaurants")
          .select(
            "id, name, category, address, city, postcode, " +
            "phone, website, opening_hours, description, " +
            "composite_score, score_qp, score_ambiance, score_service, score_food, " +
            "review_count, takeaway, delivery, outdoor_seating, wheelchair, " +
            "diet_options, price_range"
          )
          .eq("id", restaurantId)
          .single();

        console.log("[useRestaurantDetail] requête restaurant : restaurants?id=eq." + restaurantId);

        const { data: restaurantData, error: restaurantError } = await restaurantQuery;

        console.log("[useRestaurantDetail] restaurantData →", restaurantData);
        console.log("[useRestaurantDetail] restaurantError →", restaurantError);

        if (restaurantError) throw restaurantError;

        // ── 2. 20 derniers avis avec join sur public.users ───────────────────
        const { data: reviewsData, error: reviewsError } = await supabase
          .from("reviews")
          .select(
            "id, user_id, score_qp, score_ambiance, score_service, score_food, " +
            "global_score, comment, is_verified, created_at, updated_at, " +
            "review_photos(url, position), users(username, avatar_url)"
          )
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(20);

        console.log("[useRestaurantDetail] reviews (join users) →", reviewsData, "err →", reviewsError);

        if (reviewsError) throw reviewsError;

        if (!cancelled) {
          setRestaurant(restaurantData as unknown as RestaurantDetail);

          const mapped: ReviewDetail[] = (reviewsData ?? []).map((row: any) => ({
            id:            row.id,
            user_id:       row.user_id,
            username:      row.users?.username ?? "Utilisateur",
            avatar_url:    row.users?.avatar_url ?? null,
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
          }));

          setReviews(mapped);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[useRestaurantDetail] ERREUR :", e);
        if (!cancelled) {
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [restaurantId]);

  return { restaurant, reviews, loading, error };
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
