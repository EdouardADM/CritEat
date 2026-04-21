import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReviewDraft = {
  restaurantId: string;
  restaurantName: string;
  photoUri: string | null;
  scoreQp: number | null;
  scoreAmbiance: number | null;
  scoreService: number | null;
  scoreFood: number | null;
  comment: string;
  step: 1 | 2 | 3 | 4;
  savedAt: string; // ISO — auto-expire après 7 jours
};

// ── Constantes ────────────────────────────────────────────────────────────────

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const storageKey = (restaurantId: string) => `@criteat_draft_${restaurantId}`;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useReviewDraft(restaurantId: string): {
  draft: ReviewDraft | null;
  loaded: boolean;
  updateDraft: (partial: Partial<ReviewDraft>) => void;
  clearDraft: () => void;
} {
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Charge le draft existant au mount
  useEffect(() => {
    AsyncStorage.getItem(storageKey(restaurantId))
      .then((raw) => {
        if (raw) {
          const parsed: ReviewDraft = JSON.parse(raw);
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
  }, [restaurantId]);

  const updateDraft = useCallback(
    (partial: Partial<ReviewDraft>) => {
      setDraft((prev) => {
        const base: ReviewDraft = prev ?? {
          restaurantId,
          restaurantName: "",
          photoUri: null,
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
        void AsyncStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
        return next;
      });
    },
    [restaurantId]
  );

  const clearDraft = useCallback(() => {
    setDraft(null);
    void AsyncStorage.removeItem(storageKey(restaurantId));
  }, [restaurantId]);

  return { draft, loaded, updateDraft, clearDraft };
}
