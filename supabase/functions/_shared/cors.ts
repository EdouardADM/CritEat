// En-têtes CORS partagés par les Edge Functions.
// L'app mobile n'a pas besoin de CORS, mais ils permettent l'appel depuis le web
// (build react-native-web) et les tests depuis un navigateur.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
