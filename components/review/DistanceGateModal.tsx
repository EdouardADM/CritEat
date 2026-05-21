import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DistanceCheckResult } from "../../hooks/useDistanceCheck";

type Props = {
  visible: boolean;
  result: DistanceCheckResult | null;
  restaurantName: string;
  onRetry: () => void;
  onClose: () => void;
  retryCount: number;
  checking?: boolean; // affiche un spinner si le check est en cours
};

type ContentConfig = {
  icon: string;
  iconColor: string;
  title: string;
  body: string;
  primaryLabel?: string;
  primaryAction?: () => void;
  showSecondary: boolean;
};

export default function DistanceGateModal({
  visible,
  result,
  restaurantName,
  onRetry,
  onClose,
  retryCount,
  checking = false,
}: Props) {
  const content = buildContent(result, restaurantName, retryCount, onRetry, onClose);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {checking || !result ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#E8472A" />
            <Text style={styles.checkingText}>Vérification de ta position…</Text>
          </View>
        ) : (
          <>
            {/* Icône */}
            <View style={[styles.iconCircle, { backgroundColor: content.iconColor + "18" }]}>
              <Ionicons name={content.icon as any} size={40} color={content.iconColor} />
            </View>

            {/* Textes */}
            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.body}>{content.body}</Text>

            {/* Distance visuelle pour out_of_range */}
            {result.status === "out_of_range" && result.distance_m !== null && (
              <View style={styles.distancePill}>
                <Ionicons name="navigate-outline" size={16} color="#E8472A" />
                <Text style={styles.distancePillText}>
                  {result.distance_m >= 1000
                    ? `${(result.distance_m / 1000).toFixed(1)} km de ${restaurantName}`
                    : `${result.distance_m} m de ${restaurantName}`}
                </Text>
              </View>
            )}

            {/* Bouton principal */}
            {content.primaryLabel && content.primaryAction && (
              <Pressable style={styles.primaryBtn} onPress={content.primaryAction}>
                <Text style={styles.primaryBtnText}>{content.primaryLabel}</Text>
              </Pressable>
            )}

            {/* Bouton secondaire "Retour" */}
            {content.showSecondary && (
              <Pressable style={styles.secondaryBtn} onPress={onClose}>
                <Text style={styles.secondaryBtnText}>Retour</Text>
              </Pressable>
            )}

            {/* Bouton unique "Retour" si pas de primaire */}
            {!content.primaryLabel && (
              <Pressable style={styles.primaryBtn} onPress={onClose}>
                <Text style={styles.primaryBtnText}>Retour</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Logique de contenu ─────────────────────────────────────────────────────────

function buildContent(
  result: DistanceCheckResult | null,
  restaurantName: string,
  retryCount: number,
  onRetry: () => void,
  onClose: () => void,
): ContentConfig {
  if (!result) {
    return {
      icon: "location-outline",
      iconColor: "#E8472A",
      title: "Vérification…",
      body: "",
      showSecondary: false,
    };
  }

  switch (result.status) {
    case "out_of_range":
      return {
        icon: "location-outline",
        iconColor: "#E8472A",
        title: "Tu es trop loin du restaurant",
        body: `Pour publier un avis sur ${restaurantName}, tu dois être à moins de 200 m. Rapproche-toi et réessaie.`,
        showSecondary: false, // pas de bypass, retour seul
      };

    case "permission_denied":
      return {
        icon: "lock-closed-outline",
        iconColor: "#F59E0B",
        title: "Localisation requise pour publier",
        body:
          "Criteat vérifie que tu es sur place pour garantir l'authenticité des avis. Tu peux consulter, voter et explorer la carte sans localisation, mais publier un avis nécessite ta position.",
        primaryLabel: "Ouvrir les Réglages",
        primaryAction: () => { void Linking.openSettings(); },
        showSecondary: true,
      };

    case "gps_timeout":
      if (retryCount < 2) {
        return {
          icon: "time-outline",
          iconColor: "#6B7280",
          title: "Impossible de te localiser",
          body: "La localisation prend plus de temps que prévu. Vérifie que tu es à l'extérieur ou près d'une fenêtre.",
          primaryLabel: "Réessayer",
          primaryAction: onRetry,
          showSecondary: true,
        };
      }
      return {
        icon: "warning-outline",
        iconColor: "#6B7280",
        title: "Localisation indisponible",
        body: "On n'arrive pas à te localiser. Vérifie tes réglages, redémarre l'app ou réessaie plus tard.",
        showSecondary: false,
      };

    case "unknown_error":
      return {
        icon: "alert-circle-outline",
        iconColor: "#EF4444",
        title: "Erreur inattendue",
        body: "Une erreur s'est produite lors de la vérification de ta position. Réessaie.",
        primaryLabel: "Réessayer",
        primaryAction: onRetry,
        showSecondary: true,
      };

    case "in_range":
    default:
      // Ne devrait pas être visible, mais fallback propre
      return {
        icon: "checkmark-circle-outline",
        iconColor: "#16A34A",
        title: "Position vérifiée",
        body: "Tu es bien sur place.",
        showSecondary: false,
      };
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  center: {
    alignItems: "center",
    gap: 16,
  },
  checkingText: {
    fontSize: 15,
    color: "#888",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF1EF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  distancePillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#E8472A",
  },
  primaryBtn: {
    backgroundColor: "#E8472A",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: "center",
    width: "100%",
  },
  secondaryBtnText: {
    color: "#888",
    fontSize: 15,
  },
});
