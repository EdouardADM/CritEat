import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { UserListItem } from "./useUserList";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

// Recherche d'utilisateurs par nom (ILIKE), avec debounce. Exclut l'utilisateur
// courant et attache `is_followed_by_me` (même logique que useUserList).
export function useUserSearch(query: string): {
  results: UserListItem[];
  loading: boolean;
} {
  const [results, setResults] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const { data: { user: me } } = await supabase.auth.getUser();

        // Échappe les jokers ILIKE pour une recherche littérale.
        const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
        let qb = supabase
          .from("users")
          .select("id, username, avatar_url, karma_tier, review_count")
          .ilike("username", pattern)
          .order("karma_score", { ascending: false })
          .limit(20);
        if (me) qb = qb.neq("id", me.id);

        const { data, error } = await qb;
        if (error) throw error;

        const rows = (data ?? []) as Omit<UserListItem, "is_followed_by_me">[];

        const followedIds = new Set<string>();
        if (me && rows.length > 0) {
          const { data: followsData } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", me.id)
            .in("following_id", rows.map((u) => u.id));
          for (const f of followsData ?? []) followedIds.add(f.following_id);
        }

        if (!cancelled) {
          setResults(
            rows.map((u) => ({ ...u, is_followed_by_me: followedIds.has(u.id) })),
          );
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, loading };
}
