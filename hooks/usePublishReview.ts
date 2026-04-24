import { useState } from "react";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import type { ReviewDraft } from "./useReviewDraft";

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
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

/** URI locale (file:// ou content://) — à uploader */
const isLocalUri = (uri: string): boolean =>
  !uri.startsWith("http://") && !uri.startsWith("https://");

/** Extrait le chemin Storage depuis une URL publique Supabase */
function extractStoragePath(publicUrl: string): string {
  const marker = "/review-photos/";
  const idx = publicUrl.indexOf(marker);
  return idx >= 0 ? publicUrl.slice(idx + marker.length) : publicUrl;
}

/** Décode une chaîne base64 en Uint8Array (sans dépendance externe) */
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Upload une URI locale → retourne l'URL publique */
async function uploadPhoto(
  userId: string,
  restaurantId: string,
  photoUri: string,
  index: number,
): Promise<string> {
  // Lecture native en base64 (évite le pipeline fetch/blob de RN qui produit 0 bytes)
  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: "base64",
  });
  const bytes = decodeBase64(base64);
  console.log(`[uploadPhoto] photo ${index}: ${bytes.byteLength} bytes`);

  const ext = photoUri.split(".").pop()?.toLowerCase().split("?")[0] ?? "jpg";
  const storagePath = `${userId}/${restaurantId}/${Date.now()}_${index}.${ext}`;
  const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;

  const { error: uploadError } = await supabase.storage
    .from("review-photos")
    .upload(storagePath, bytes, {
      contentType,
      upsert: false,
    });
  if (uploadError) {
    console.error("[usePublishReview] Storage upload error:", uploadError);
    throw uploadError;
  }

  const { data: { publicUrl } } = supabase.storage
    .from("review-photos")
    .getPublicUrl(storagePath);

  return publicUrl;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePublishReview(): {
  publishing: boolean;
  publish: (
    draft: ReviewDraft,
    restaurantLat: number | null,
    restaurantLng: number | null,
    onSuccess: () => void,
  ) => Promise<void>;
} {
  const [publishing, setPublishing] = useState(false);

  const publish = async (
    draft: ReviewDraft,
    restaurantLat: number | null,
    restaurantLng: number | null,
    onSuccess: () => void,
  ) => {
    setPublishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const isEdit = draft.mode === "edit";

      if (isEdit) {
        // ── Mode édition ─────────────────────────────────────────────────────
        if (!draft.reviewId) throw new Error("reviewId manquant en mode édition");
        if (!draft.photos || draft.photos.length === 0)
          throw new Error("Au moins une photo est requise");

        // 1. UPDATE reviews (scores + commentaire ; updated_at géré par trigger)
        const { error: updateError } = await supabase
          .from("reviews")
          .update({
            score_qp:       draft.scoreQp,
            score_ambiance: draft.scoreAmbiance,
            score_service:  draft.scoreService,
            score_food:     draft.scoreFood,
            comment:        draft.comment,
          })
          .eq("id", draft.reviewId);
        if (updateError) throw updateError;

        // 2. Supprimer du Storage les photos retirées (best effort)
        const removedUrls = (draft.originalPhotos ?? []).filter(
          (url) => !draft.photos.includes(url),
        );
        for (const url of removedUrls) {
          try {
            await supabase.storage
              .from("review-photos")
              .remove([extractStoragePath(url)]);
          } catch {
            // best effort
          }
        }

        // 3. Supprimer toutes les lignes review_photos existantes
        const { error: deleteErr } = await supabase
          .from("review_photos")
          .delete()
          .eq("review_id", draft.reviewId);
        if (deleteErr)
          console.error("[usePublishReview] delete review_photos error:", deleteErr);

        // 4. Uploader les nouvelles photos locales + ré-insérer toutes
        const finalPhotos: { url: string; position: number }[] = [];
        for (let i = 0; i < draft.photos.length; i++) {
          const uri = draft.photos[i];
          try {
            const url = isLocalUri(uri)
              ? await uploadPhoto(user.id, draft.restaurantId, uri, i)
              : uri;
            finalPhotos.push({ url, position: i });
          } catch (e) {
            console.error(`[usePublishReview] photo ${i} upload error:`, e);
            // on continue avec les autres photos
          }
        }

        if (finalPhotos.length > 0) {
          const { error: insertPhotosErr } = await supabase
            .from("review_photos")
            .insert(
              finalPhotos.map((p) => ({
                review_id: draft.reviewId!,
                url:       p.url,
                position:  p.position,
              })),
            );
          if (insertPhotosErr)
            console.error("[usePublishReview] review_photos insert error:", insertPhotosErr);
        }

      } else {
        // ── Mode création ────────────────────────────────────────────────────
        if (!draft.photos || draft.photos.length === 0)
          throw new Error("Photo manquante");

        // Badge vérifié : GPS < 200 m du restaurant
        let isVerified = false;
        if (restaurantLat != null && restaurantLng != null) {
          try {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            isVerified =
              haversineMeters(
                pos.coords.latitude, pos.coords.longitude,
                restaurantLat, restaurantLng,
              ) <= 200;
          } catch {
            // géoloc indisponible → is_verified reste false
          }
        }

        // Upload de toutes les photos en parallèle
        const uploadedPhotos = await Promise.all(
          draft.photos.map(async (photoUri, index) => {
            const url = await uploadPhoto(user.id, draft.restaurantId, photoUri, index);
            return { url, position: index };
          }),
        );

        // INSERT reviews
        const { data: createdReview, error: insertError } = await supabase
          .from("reviews")
          .insert({
            restaurant_id:  draft.restaurantId,
            user_id:        user.id,
            score_qp:       draft.scoreQp,
            score_ambiance: draft.scoreAmbiance,
            score_service:  draft.scoreService,
            score_food:     draft.scoreFood,
            comment:        draft.comment,
            is_verified:    isVerified,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        // INSERT review_photos
        const { error: photosError } = await supabase
          .from("review_photos")
          .insert(
            uploadedPhotos.map((p) => ({
              review_id: createdReview.id,
              url:       p.url,
              position:  p.position,
            })),
          );
        if (photosError)
          console.error("[usePublishReview] review_photos insert error:", photosError);
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
