import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ReviewDetail } from "./useRestaurantDetail";

// ── Hook ──────────────────────────────────────────────────────────────────────
// Récupère l'avis de l'utilisateur connecté pour un restaurant donné.
// Retourne null (sans erreur) si l'utilisateur n'a pas encore posté d'avis.

export function useMyReviewForRestaurant(restaurantId: string | null): {
  myReview: ReviewDetail | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [myReview, setMyReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = useCallback(() => setFetchTick((n) => n + 1), []);

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) setMyReview(null);
          return;
        }

        const { data, error: queryError } = await supabase
          .from("reviews")
          .select(
            "id, user_id, score_qp, score_ambiance, score_service, score_food, " +
            "global_score, comment, is_verified, created_at, updated_at, upvotes, downvotes, " +
            "review_photos(url, position), users(username, avatar_url, karma_tier)"
          )
          .eq("restaurant_id", restaurantId)
          .eq("user_id", user.id)
          .maybeSingle(); // retourne null sans erreur si aucune ligne

        if (queryError) throw queryError;

        if (!cancelled) {
          if (data) {
            setMyReview({
              id:             data.id,
              user_id:        data.user_id,
              username:       (data.users as any)?.username ?? "Moi",
              avatar_url:     (data.users as any)?.avatar_url ?? null,
              karma_tier:     (data.users as any)?.karma_tier ?? "novice",
              comment:        data.comment,
              is_verified:    data.is_verified ?? false,
              created_at:     data.created_at,
              updated_at:     data.updated_at,
              review_photos:  (data.review_photos ?? []).sort(
                (a: { position: number }, b: { position: number }) =>
                  a.position - b.position
              ),
              score_qp:       data.score_qp,
              score_ambiance: data.score_ambiance,
              score_service:  data.score_service,
              score_food:     data.score_food,
              global_score:   data.global_score,
              upvotes:        (data as any).upvotes ?? 0,
              downvotes:      (data as any).downvotes ?? 0,
              my_vote:        null,
            });
          } else {
            setMyReview(null);
          }
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId, fetchTick]);

  return { myReview, loading, error, refetch };
}
