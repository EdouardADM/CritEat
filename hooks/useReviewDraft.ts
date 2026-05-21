import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import type { CapturedLocation } from "./useCurrentPosition";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReviewDraft = {
  restaurantId: string;
  restaurantName: string;
  photos: string[];
  /** Position GPS au moment du pick, indexée comme photos[]. null = permission refusée. */
  photoLocations?: (CapturedLocation | null)[];
  /** Distance mesurée au gate de distance (avant ouverture du flow). null = hors flow ou legacy. */
  gateDistance?: number | null;
  /** Précision GPS au gate de distance, en mètres. */
  gateAccuracy?: number | null;
  scoreQp: number | null;
  scoreAmbiance: number | null;
  scoreService: number | null;
  scoreFood: number | null;
  comment: string;
  step: 1 | 2 | 3 | 4;
  savedAt: string; // ISO — auto-expire après 7 jours
  // ── Mode édition ────────────────────────────────────────────────────────────
  mode?: "create" | "edit";  // absent → rétrocompat "create"
  reviewId?: string;         // id de l'avis à modifier
  originalPhotos?: string[]; // URLs serveur au moment du chargement (pour le diff)
};

// ── Constantes ────────────────────────────────────────────────────────────────

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const storageKey = (restaurantId: string) => `@criteat_draft_${restaurantId}`;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useReviewDraft(
  restaurantId: string,
  mode: "create" | "edit" = "create",
): {
  draft: ReviewDraft | null;
  loaded: boolean;
  updateDraft: (partial: Partial<ReviewDraft>) => void;
  clearDraft: () => void;
} {
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  // En mode édition, pas d'AsyncStorage → "chargé" immédiatement
  const [loaded, setLoaded] = useState(mode === "edit");

  // Charge le draft existant au mount — ignoré en mode édition
  useEffect(() => {
    if (mode === "edit") return;
    AsyncStorage.getItem(storageKey(restaurantId))
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as ReviewDraft & { photoUri?: string | null };
          // Rétrocompat : ancien draft avec photoUri au lieu de photos
          if (!Array.isArray(parsed.photos)) {
            parsed.photos = parsed.photoUri ? [parsed.photoUri] : [];
            delete parsed.photoUri;
          }
          const age = Date.now() - new Date(parsed.savedAt).getTime();
          if (age < TTL_MS) {
            setDraft(parsed);
          } else {
            // Expiré — nettoyage silencieux
            void AsyncStorage.removeItem(storageKey(restaurantId));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [restaurantId, mode]);

  const updateDraft = useCallback(
    (partial: Partial<ReviewDraft>) => {
      setDraft((prev) => {
        const base: ReviewDraft = prev ?? {
          restaurantId,
          restaurantName: "",
          photos: [],
          scoreQp: null,
          scoreAmbiance: null,
          scoreService: null,
          scoreFood: null,
          comment: "",
          step: 1,
          savedAt: new Date().toISOString(),
        };
        const next: ReviewDraft = {
          ...base,
          ...partial,
          savedAt: new Date().toISOString(),
        };
        // Pas de persistance AsyncStorage en mode édition
        if (mode !== "edit") {
          void AsyncStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
        }
        return next;
      });
    },
    [restaurantId, mode]
  );

  const clearDraft = useCallback(() => {
    setDraft(null);
    if (mode !== "edit") {
      void AsyncStorage.removeItem(storageKey(restaurantId));
    }
  }, [restaurantId, mode]);

  return { draft, loaded, updateDraft, clearDraft };
}
