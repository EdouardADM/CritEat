import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { UserRowItem } from "../components/UserRow";

export type FollowMode = "followers" | "following";

// Liste les abonnés (followers) ou les abonnements (following) d'un utilisateur.
// Approche en deux temps : on lit les ids dans `follows`, puis on charge les
// profils correspondants — évite l'ambiguïté des deux clés étrangères de
// `follows` vers `users`.
export function useFollowList(
  userId: string,
  mode: FollowMode,
): {
  users: UserRowItem[];
  loading: boolean;
  error: string | null;
} {
  const [users, setUsers] = useState<UserRowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. ids des utilisateurs concernés.
        const selectCol = mode === "followers" ? "follower_id" : "following_id";
        const filterCol = mode === "followers" ? "following_id" : "follower_id";
        const { data: links, error: linksErr } = await supabase
          .from("follows")
          .select(selectCol)
          .eq(filterCol, userId);
        if (linksErr) throw linksErr;

        const ids = (links ?? []).map((l: any) => l[selectCol] as string);
        if (ids.length === 0) {
          if (!cancelled) setUsers([]);
          return;
        }

        // 2. profils.
        const { data: usersData, error: usersErr } = await supabase
          .from("users")
          .select("id, username, avatar_url, karma_tier, review_count")
          .in("id", ids);
        if (usersErr) throw usersErr;

        // 3. lesquels le spectateur courant suit-il déjà ?
        const { data: { user: me } } = await supabase.auth.getUser();
        const followedByMe = new Set<string>();
        if (me && ids.length > 0) {
          const { data: mine } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", me.id)
            .in("following_id", ids);
          for (const f of mine ?? []) followedByMe.add(f.following_id);
        }

        if (!cancelled) {
          setUsers(
            (usersData ?? []).map((u: any) => ({
              id: u.id,
              username: u.username,
              avatar_url: u.avatar_url ?? null,
              karma_tier: u.karma_tier ?? "novice",
              review_count: u.review_count ?? 0,
              is_followed_by_me: followedByMe.has(u.id),
            })),
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, mode]);

  return { users, loading, error };
}
