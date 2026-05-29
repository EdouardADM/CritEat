import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";

export type VoteValue = 1 | -1;

// Hook encapsulant l'unique écriture client autorisée : la table `votes`.
// Les compteurs upvotes/downvotes des avis et le karma de l'auteur sont
// recalculés côté serveur par triggers — jamais ici.
export function useReviewVote(): {
  submitting: boolean;
  // Applique la règle « un seul vote modifiable » :
  // - même sens que `current` → retire le vote
  // - sinon → crée / change le vote
  // Renvoie le nouvel état du vote (1, -1 ou null).
  toggleVote: (
    reviewId: string,
    next: VoteValue,
    current: VoteValue | null,
  ) => Promise<VoteValue | null>;
} {
  const [submitting, setSubmitting] = useState(false);

  const toggleVote = useCallback(
    async (reviewId: string, next: VoteValue, current: VoteValue | null) => {
      setSubmitting(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non authentifié");

        if (current === next) {
          // Annulation : on retire le vote existant.
          const { error } = await supabase
            .from("votes")
            .delete()
            .eq("user_id", user.id)
            .eq("review_id", reviewId);
          if (error) throw error;
          return null;
        }

        // Création ou changement de sens via upsert sur (user_id, review_id).
        const { error } = await supabase
          .from("votes")
          .upsert(
            { user_id: user.id, review_id: reviewId, value: next },
            { onConflict: "user_id,review_id" },
          );
        if (error) throw error;
        return next;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { submitting, toggleVote };
}
