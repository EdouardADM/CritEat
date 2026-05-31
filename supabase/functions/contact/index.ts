// Edge Function : formulaire de contact (RGPD §6.7.2 — transparence / exercice des droits).
//
// Envoie la demande de l'utilisateur vers une boîte dédiée au projet, et un accusé
// de réception à l'utilisateur. L'envoi d'email exige une clé serveur → Edge Function.
//
// Déploiement : supabase functions deploy contact
// Secrets à définir :
//   supabase secrets set RESEND_API_KEY=...        (clé API Resend)
//   supabase secrets set CONTACT_TO_EMAIL=...       (boîte dédiée qui reçoit les demandes)
//   supabase secrets set CONTACT_FROM_EMAIL=...     (expéditeur, domaine vérifié Resend)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CONTACT_TO_EMAIL = Deno.env.get("CONTACT_TO_EMAIL")!;
const CONTACT_FROM_EMAIL = Deno.env.get("CONTACT_FROM_EMAIL")!;

const MAX_SUBJECT = 150;
const MAX_MESSAGE = 5000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: CONTACT_FROM_EMAIL, to, subject, html }),
  });
  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  try {
    // 1. Authentifier l'appelant et récupérer son email.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "Non authentifié." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user?.email) {
      return jsonResponse({ error: "Non authentifié." }, 401);
    }
    const userEmail = userData.user.email;

    // 2. Valider l'entrée.
    const body = await req.json().catch(() => null);
    const subject = String(body?.subject ?? "").trim().slice(0, MAX_SUBJECT);
    const message = String(body?.message ?? "").trim().slice(0, MAX_MESSAGE);
    if (!subject || !message) {
      return jsonResponse({ error: "Sujet et message requis." }, 400);
    }

    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

    // 3. Email vers la boîte dédiée.
    const okTeam = await sendEmail(
      CONTACT_TO_EMAIL,
      `[CritEat Contact] ${safeSubject}`,
      `<p><strong>De :</strong> ${escapeHtml(userEmail)}</p>
       <p><strong>Sujet :</strong> ${safeSubject}</p>
       <hr><p>${safeMessage}</p>`,
    );
    if (!okTeam) {
      return jsonResponse({ error: "Envoi impossible pour le moment." }, 502);
    }

    // 4. Accusé de réception à l'utilisateur (échec non bloquant).
    await sendEmail(
      userEmail,
      "Nous avons bien reçu ta demande — CritEat",
      `<p>Bonjour,</p>
       <p>Nous confirmons la bonne réception de ta demande concernant : <strong>${safeSubject}</strong>.</p>
       <p>Nous te répondrons dans un délai maximal d'un mois, conformément à l'article 12.3 du RGPD.</p>
       <p>— L'équipe CritEat</p>`,
    );

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Une erreur est survenue." }, 500);
  }
});
