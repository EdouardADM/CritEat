import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";

// Hook encapsulant l'unique écriture client autorisée pour le suivi : la table
// `follows`. Les compteurs follower_count / following_count sont recalculés côté
// serveur par le trigger `on_follow_update_counts` — jamais ici.
export function useFollow(): {
  submitting: boolean;
  // Bascule le suivi. Renvoie le nouvel état (true = suivi, false = non suivi).
  toggleFollow: (targetId: string, currentlyFollowing: boolean) => Promise<boolean>;
} {
  const [submitting, setSubmitting] = useState(false);

  const toggleFollow = useCallback(
    async (targetId: string, currentlyFollowing: boolean) => {
      setSubmitting(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non authentifié");
        if (user.id === targetId) throw new Error("Impossible de se suivre soi-même");

        if (currentlyFollowing) {
          const { error } = await supabase
            .from("follows")
            .delete()
            .eq("follower_id", user.id)
            .eq("following_id", targetId);
          if (error) throw error;
          return false;
        }

        // Insertion idempotente (la PK composite empêche les doublons).
        const { error } = await supabase
          .from("follows")
          .upsert(
            { follower_id: user.id, following_id: targetId },
            { onConflict: "follower_id,following_id", ignoreDuplicates: true },
          );
        if (error) throw error;
        return true;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { submitting, toggleFollow };
}
