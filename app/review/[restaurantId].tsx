import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import StepPhoto   from "../../components/review/StepPhoto";
import StepScores  from "../../components/review/StepScores";
import StepComment from "../../components/review/StepComment";
import StepConfirm from "../../components/review/StepConfirm";
import { useReviewDraft } from "../../hooks/useReviewDraft";
import { usePublishReview } from "../../hooks/usePublishReview";
import { useMyReviewForRestaurant } from "../../hooks/useMyReviewForRestaurant";
import { countChars } from "../../utils/text";
import type { ScoreKey } from "../../components/review/StepScores";

// ── Constantes ────────────────────────────────────────────────────────────────

const STEP_TITLES = ["Photo", "Notes", "Commentaire", "Confirmation"] as const;
const MIN_COMMENT = 50;

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ReviewScreen() {
  const params = useLocalSearchParams<{
    restaurantId: string;
    name?: string;
    lat?: string;
    lng?: string;
    editId?: string;
    gateDist?: string;
    gateAcc?: string;
  }>();
  const restaurantId   = params.restaurantId;
  const restaurantName = params.name   ? decodeURIComponent(params.name) : "Restaurant";
  const restaurantLat  = params.lat    ? parseFloat(params.lat)  : null;
  const restaurantLng  = params.lng    ? parseFloat(params.lng)  : null;
  const editId         = params.editId ?? null;
  const isEditMode     = !!editId;
  const gateDistParam  = params.gateDist ? parseFloat(params.gateDist) : null;
  const gateAccParam   = params.gateAcc  ? parseFloat(params.gateAcc)  : null;

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { draft, loaded, updateDraft, clearDraft } = useReviewDraft(
    restaurantId,
    isEditMode ? "edit" : "create",
  );
  const { publish, publishing } = usePublishReview();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Charge l'avis existant uniquement en mode édition
  const { myReview: existingReview, loading: existingLoading } =
    useMyReviewForRestaurant(isEditMode ? restaurantId : null);

  // Mode édition : pré-remplit le draft depuis le serveur (une seule fois)
  const editSeededRef = useRef(false);
  useEffect(() => {
    if (!isEditMode || !existingReview || editSeededRef.current) return;
    editSeededRef.current = true;
    const serverPhotos = existingReview.review_photos.map((p) => p.url);
    updateDraft({
      restaurantId,
      restaurantName,
      photos:         serverPhotos,
      originalPhotos: serverPhotos,
      scoreQp:        existingReview.score_qp,
      scoreAmbiance:  existingReview.score_ambiance,
      scoreService:   existingReview.score_service,
      scoreFood:      existingReview.score_food,
      comment:        existingReview.comment ?? "",
      mode:           "edit",
      reviewId:       editId!,
      step:           1,
    });
    setStep(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, existingReview]);

  // Mode création : restaure le step si un draft existe + persiste la mesure gate
  useEffect(() => {
    if (isEditMode || !loaded) return;
    if (draft) {
      setStep(draft.step);
    } else {
      updateDraft({ restaurantId, restaurantName, step: 1 });
    }
    // Écrit la distance gate dans le draft (une seule fois à l'entrée du flow)
    if (gateDistParam !== null) {
      updateDraft({ gateDistance: gateDistParam, gateAccuracy: gateAccParam });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // ── Navigation entre steps ─────────────────────────────────────────────────

  const goToStep = useCallback(
    (next: 1 | 2 | 3 | 4) => {
      setStep(next);
      updateDraft({ step: next });
    },
    [updateDraft]
  );

  const handleBack = useCallback(() => {
    if (step === 1) {
      router.back();
    } else {
      goToStep((step - 1) as 1 | 2 | 3 | 4);
    }
  }, [step, goToStep, router]);

  // ── Publication ────────────────────────────────────────────────────────────

  const handleNext = useCallback(async () => {
    if (step < 4) {
      goToStep((step + 1) as 2 | 3 | 4);
      return;
    }
    if (!draft) return;
    try {
      await publish(draft, restaurantLat, restaurantLng, () => {
        clearDraft();
        router.replace(`/restaurant/${restaurantId}`);
      });
    } catch (e) {
      Alert.alert(
        "Erreur de publication",
        e instanceof Error ? e.message : "Une erreur est survenue, réessayez.",
        [{ text: "OK" }]
      );
    }
  }, [step, draft, publish, restaurantLat, restaurantLng, clearDraft, router, restaurantId, goToStep]);

  // ── Validation par step ────────────────────────────────────────────────────

  const isNextEnabled = (() => {
    if (!draft) return false;
    switch (step) {
      case 1: return draft.photos.length > 0;
      case 2: return (
        draft.scoreQp       != null &&
        draft.scoreAmbiance != null &&
        draft.scoreService  != null &&
        draft.scoreFood     != null
      );
      case 3: return countChars(draft.comment) >= MIN_COMMENT;
      case 4: return true;
    }
  })();

  // ── Chargement initial ─────────────────────────────────────────────────────
  // Création : attend AsyncStorage | Édition : attend le serveur + seeding
  const isReady = isEditMode
    ? (!existingLoading && draft !== null)
    : loaded;

  if (!isReady) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color="#E8472A" />
      </View>
    );
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.headerSide}
        >
          <Ionicons
            name={step === 1 ? "close" : "arrow-back"}
            size={24}
            color="#1a1a1a"
          />
        </Pressable>

        <Text style={styles.headerTitle}>{STEP_TITLES[step - 1]}</Text>

        {/* Spacer symétrique */}
        <View style={styles.headerSide} />
      </View>

      {/* Barre de progression */}
      <View style={styles.progressRow}>
        {([1, 2, 3, 4] as const).map((s) => (
          <View
            key={s}
            style={[
              styles.dot,
              s < step  && styles.dotDone,
              s === step && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Nom du restaurant + mode */}
      <Text style={styles.subtitle} numberOfLines={1}>
        {isEditMode ? `Modifier · ${restaurantName}` : restaurantName}
      </Text>

      {/* Contenu du step courant */}
      <View style={styles.content}>
        {step === 1 && (
          <StepPhoto
            photos={draft?.photos ?? []}
            onAddPhoto={(uri, location) =>
              updateDraft({
                photos:        [...(draft?.photos ?? []), uri],
                photoLocations: [...(draft?.photoLocations ?? []), location],
              })
            }
            onRemovePhoto={(index) =>
              updateDraft({
                photos:        (draft?.photos ?? []).filter((_, i) => i !== index),
                photoLocations: (draft?.photoLocations ?? []).filter((_, i) => i !== index),
              })
            }
          />
        )}
        {step === 2 && (
          <StepScores
            scoreQp={draft?.scoreQp ?? null}
            scoreAmbiance={draft?.scoreAmbiance ?? null}
            scoreService={draft?.scoreService ?? null}
            scoreFood={draft?.scoreFood ?? null}
            onChange={(key: ScoreKey, value: number) =>
              updateDraft({ [key]: value })
            }
          />
        )}
        {step === 3 && (
          <StepComment
            comment={draft?.comment ?? ""}
            onChange={(text) => updateDraft({ comment: text })}
          />
        )}
        {step === 4 && draft && (
          <StepConfirm draft={draft} restaurantName={restaurantName} />
        )}
      </View>

      {/* Bouton Suivant / Publier */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[
            styles.nextBtn,
            (!isNextEnabled || publishing) && styles.nextBtnDisabled,
          ]}
          onPress={handleNext}
          disabled={!isNextEnabled || publishing}
        >
          {publishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextBtnText}>
              {step === 4 ? "Publier" : "Suivant"}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#fff" },
  centered:{ alignItems: "center", justifyContent: "center" },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerSide: {
    width: 36,
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
  },

  // ── Progression ────────────────────────────────────────────────────────────
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EEE",
  },
  dotDone: {
    backgroundColor: "#E8472A55",
  },
  dotActive: {
    width: 20,
    backgroundColor: "#E8472A",
  },

  // ── Sous-titre ─────────────────────────────────────────────────────────────
  subtitle: {
    textAlign: "center",
    fontSize: 13,
    color: "#888",
    paddingBottom: 10,
    paddingHorizontal: 40,
  },

  // ── Contenu ────────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5E5",
  },
  nextBtn: {
    backgroundColor: "#E8472A",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  nextBtnDisabled: {
    backgroundColor: "#F0C0B8",
  },
  nextBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
