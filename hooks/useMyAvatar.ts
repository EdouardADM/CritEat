import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// Récupère l'avatar (et le username pour le fallback initiales) de l'utilisateur
// courant — léger, pour le marqueur de position sur la carte. Re-fetch à chaque
// focus de l'écran → le marqueur reflète une modif d'avatar sans relancer l'app.
export function useMyAvatar(): { avatarUrl: string | null; username: string | null } {
  const { user } = useAuth();
  const uid = user?.id;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        setAvatarUrl(null);
        setUsername(null);
        return;
      }
      let cancelled = false;
      supabase
        .from("users")
        .select("avatar_url, username")
        .eq("id", uid)
        .single()
        .then(({ data }) => {
          if (cancelled || !data) return;
          setAvatarUrl(data.avatar_url ?? null);
          setUsername(data.username ?? null);
        });
      return () => { cancelled = true; };
    }, [uid])
  );

  return { avatarUrl, username };
}
