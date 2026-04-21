import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { LocationManager, LogManager, NetworkManager } from "@maplibre/maplibre-react-native";

// Désactive le LocationManager interne de MapLibre (MLRNLocationModule).
// La localisation est gérée exclusivement par expo-location.
NetworkManager.setConnected(true);
LocationManager.stop();

// Filtre les logs parasites : les annulations de tuiles (comportement normal au pan/zoom)
LogManager.onLog((log) => {
  if (log.message.includes("Canceled")) return true; // supprime
  return false; // laisse passer
});

/** Gère les redirections en fonction de la session */
function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // On attend que l'état d'auth soit résolu avant de rediriger
    if (loading) return;

    const onAuthScreen =
      segments[0] === "login" || segments[0] === "register";

    if (!session && !onAuthScreen) {
      // Pas connecté → vers l'écran de connexion
      router.replace("/login");
    } else if (session && onAuthScreen) {
      // Déjà connecté → vers l'accueil
      router.replace("/map");
    }
  }, [session, loading, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
