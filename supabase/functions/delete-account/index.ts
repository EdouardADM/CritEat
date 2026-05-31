// Edge Function : suppression définitive du compte (RGPD Art. 17 — droit à l'effacement).
//
// L'opération exige les privilèges admin (service role) que le client ne possède
// pas : elle efface les fichiers Storage, toutes les lignes applicatives, puis
// l'enregistrement d'authentification (auth.users).
//
// Déploiement : supabase functions deploy delete-account
// Secrets : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement
//           par la plateforme Supabase (pas besoin de les définir à la main).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Supprime récursivement tous les objets sous le préfixe `${uid}/` d'un bucket.
async function purgeBucketPrefix(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<void> {
  const { data: entries, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
  });
  if (error || !entries) return;

  const files: string[] = [];
  for (const entry of entries) {
    // Une entrée sans `id` est un sous-dossier → on descend récursivement.
    if (entry.id === null) {
      await purgeBucketPrefix(admin, bucket, `${prefix}/${entry.name}`);
    } else {
      files.push(`${prefix}/${entry.name}`);
    }
  }
  if (files.length > 0) {
    await admin.storage.from(bucket).remove(files);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  try {
    // 1. Authentifier l'appelant à partir de son JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "Non authentifié." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Non authentifié." }, 401);
    }
    const uid = userData.user.id;

    // 2. Effacer les fichiers Storage de l'utilisateur (préfixe `${uid}/`).
    await purgeBucketPrefix(admin, "avatars", uid);
    await purgeBucketPrefix(admin, "review-photos", uid);

    // 3. Effacer les données applicatives, enfants d'abord (FK).
    //    Les triggers de recalcul (karma, scores resto, compteurs) s'exécutent normalement.
    const { data: myReviews } = await admin
      .from("reviews")
      .select("id")
      .eq("user_id", uid);
    const reviewIds = (myReviews ?? []).map((r: { id: string }) => r.id);

    // Votes émis par l'utilisateur.
    await admin.from("votes").delete().eq("user_id", uid);
    // Photos puis avis de l'utilisateur.
    if (reviewIds.length > 0) {
      await admin.from("review_photos").delete().in("review_id", reviewIds);
    }
    await admin.from("reviews").delete().eq("user_id", uid);
    // Relations de suivi (dans les deux sens).
    await admin.from("follows").delete().eq("follower_id", uid);
    await admin.from("follows").delete().eq("following_id", uid);
    // Listes et leurs items.
    const { data: myLists } = await admin
      .from("lists")
      .select("id")
      .eq("user_id", uid);
    const listIds = (myLists ?? []).map((l: { id: string }) => l.id);
    if (listIds.length > 0) {
      await admin.from("list_items").delete().in("list_id", listIds);
    }
    await admin.from("lists").delete().eq("user_id", uid);
    // Profil applicatif.
    await admin.from("users").delete().eq("id", uid);

    // 4. Effacer l'enregistrement d'authentification.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      return jsonResponse({ error: "Échec de la suppression du compte." }, 500);
    }

    return jsonResponse({ ok: true });
  } catch {
    // Message générique, aucun détail sensible.
    return jsonResponse({ error: "Une erreur est survenue." }, 500);
  }
});
