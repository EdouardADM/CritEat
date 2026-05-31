import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth, hasValidConsent } from "../context/AuthContext";
import { LogManager } from "@maplibre/maplibre-react-native";

// Filtre les logs parasites : les annulations de tuiles (comportement normal au pan/zoom)
LogManager.onLog((log) => {
  if (log.message.includes("Canceled")) return true; // supprime
  return false; // laisse passer
});

/** Gère les redirections en fonction de la session */
function RootLayoutNav() {
  const { session, user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // On attend que l'état d'auth soit résolu avant de rediriger
    if (loading) return;

    const onAuthScreen =
      segments[0] === "login" ||
      segments[0] === "register" ||
      segments[0] === "verify";
    const onConsentScreen = segments[0] === "consent";
    // La politique reste consultable même sans consentement (lien des cases à cocher).
    const onPrivacyScreen = segments[0] === "privacy";

    if (!session && !onAuthScreen && !onConsentScreen && !onPrivacyScreen) {
      // Pas connecté → vers l'écran de connexion
      router.replace("/login");
    } else if (session && !hasValidConsent(user) && !onConsentScreen && !onPrivacyScreen) {
      // Connecté mais sans consentement valide (session persistée / politique mise à jour)
      router.replace("/consent");
    } else if (session && hasValidConsent(user) && (onAuthScreen || onConsentScreen)) {
      // Déjà connecté et consentement OK → vers l'accueil
      router.replace("/map");
    }
  }, [session, user, loading, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
