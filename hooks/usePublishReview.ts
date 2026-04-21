import { useState } from "react";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import type { ReviewDraft } from "./useReviewDraft";

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePublishReview(): {
  publishing: boolean;
  publish: (
    draft: ReviewDraft,
    restaurantLat: number | null,
    restaurantLng: number | null,
    onSuccess: () => void
  ) => Promise<void>;
} {
  const [publishing, setPublishing] = useState(false);

  const publish = async (
    draft: ReviewDraft,
    restaurantLat: number | null,
    restaurantLng: number | null,
    onSuccess: () => void
  ) => {
    setPublishing(true);
    try {
      // 1. Auth
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // 2. Badge vérifié : GPS < 200 m du restaurant
      let isVerified = false;
      if (restaurantLat != null && restaurantLng != null) {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          isVerified =
            haversineMeters(
              pos.coords.latitude,
              pos.coords.longitude,
              restaurantLat,
              restaurantLng
            ) <= 200;
        } catch {
          // Géoloc indisponible → is_verified reste false
        }
      }

      // 3. Upload de la photo dans Supabase Storage
      if (!draft.photoUri) throw new Error("Photo manquante");
      const photoResponse = await fetch(draft.photoUri);
      const blob = await photoResponse.blob();
      const ext =
        draft.photoUri.split(".").pop()?.toLowerCase().split("?")[0] ?? "jpg";
      const storagePath = `${user.id}/${draft.restaurantId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("review-photos")
        .upload(storagePath, blob, {
          contentType: blob.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
          upsert: false,
        });
      if (uploadError) {
        console.error("[usePublishReview] Storage upload error:", uploadError);
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("review-photos").getPublicUrl(storagePath);

      // 4. Insertion dans la table reviews
      const { error: insertError } = await supabase.from("reviews").insert({
        restaurant_id: draft.restaurantId,
        user_id: user.id,
        photo_url: publicUrl,
        score_qp: draft.scoreQp,
        score_ambiance: draft.scoreAmbiance,
        score_service: draft.scoreService,
        score_food: draft.scoreFood,
        comment: draft.comment,
        is_verified: isVerified,
      });
      if (insertError) {
        console.error("[usePublishReview] reviews insert error:", insertError);
        throw insertError;
      }

      onSuccess();
    } catch (e) {
      console.error("[usePublishReview] publish failed:", e);
      throw e;
    } finally {
      setPublishing(false);
    }
  };

  return { publish, publishing };
}
