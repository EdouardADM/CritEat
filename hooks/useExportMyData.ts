import { useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { supabase } from "../lib/supabase";

// Droit d'accès & portabilité (RGPD Art. 15 & 20) : assemble toutes les données
// de l'utilisateur courant dans un fichier JSON structuré, puis ouvre la feuille
// de partage du système pour qu'il en obtienne une copie.
//
// Toutes les lectures passent par les SELECT autorisés par la RLS (propriétaire).
export function useExportMyData(): {
  exporting: boolean;
  exportData: () => Promise<void>;
} {
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const uid = user.id;

      const [profile, reviews, votes, follows, following, lists] = await Promise.all([
        supabase.from("users").select("*").eq("id", uid).maybeSingle(),
        supabase
          .from("reviews")
          .select("*, review_photos(*)")
          .eq("user_id", uid),
        supabase.from("votes").select("*").eq("user_id", uid),
        supabase.from("follows").select("*").eq("follower_id", uid),
        supabase.from("follows").select("*").eq("following_id", uid),
        supabase.from("lists").select("*, list_items(*)").eq("user_id", uid),
      ]);

      const payload = {
        export_metadata: {
          generated_at: new Date().toISOString(),
          format: "CritEat data export (RGPD Art. 15 & 20)",
        },
        account: {
          id: uid,
          email: user.email,
          created_at: user.created_at,
          consent: {
            accepted_at: user.user_metadata?.consent_accepted_at ?? null,
            version: user.user_metadata?.consent_version ?? null,
            withdrawn_at: user.user_metadata?.consent_withdrawn_at ?? null,
          },
        },
        profile: profile.data ?? null,
        reviews: reviews.data ?? [],
        votes: votes.data ?? [],
        follows: {
          following: follows.data ?? [],
          followers: following.data ?? [],
        },
        lists: lists.data ?? [],
      };

      const json = JSON.stringify(payload, null, 2);
      const fileUri = `${FileSystem.cacheDirectory}criteat-mes-donnees.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: "utf8",
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Exporter mes données CritEat",
          UTI: "public.json",
        });
      }
    } finally {
      setExporting(false);
    }
  };

  return { exporting, exportData };
}
