import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type UserListItem = {
  id: string;
  username: string;
  avatar_url: string | null;
  karma_tier: string;
  review_count: number;
};

export function useUserList(): {
  users: UserListItem[];
  loading: boolean;
  error: string | null;
} {
  const [users, setUsers]     = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: { user: me } } = await supabase.auth.getUser();

        const query = supabase
          .from("users")
          .select("id, username, avatar_url, karma_tier, review_count")
          .order("karma_score", { ascending: false })
          .limit(50);

        // Exclure l'utilisateur connecté
        if (me) query.neq("id", me.id);

        const { data, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        if (!cancelled) setUsers((data ?? []) as UserListItem[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { users, loading, error };
}
