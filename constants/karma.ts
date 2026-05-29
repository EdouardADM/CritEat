// ── Configuration centralisée des paliers de Karma ─────────────────────────────
// karma_tier est maintenu côté serveur (lecture seule client). Source unique de
// vérité pour le libellé FR, la couleur et l'icône de chaque palier.

export type KarmaTier = "novice" | "confirmed_critic" | "local_expert";

export const KARMA_CONFIG: Record<KarmaTier, { label: string; color: string; icon: string }> = {
  novice:           { label: "Novice",            color: "#9CA3AF", icon: "leaf-outline"   },
  confirmed_critic: { label: "Critique confirmé", color: "#3B82F6", icon: "ribbon-outline" },
  local_expert:     { label: "Expert local",      color: "#F59E0B", icon: "trophy-outline" },
};

// Robuste à une valeur inconnue ou nulle → fallback Novice.
export function getKarma(tier: string | null | undefined) {
  return KARMA_CONFIG[(tier as KarmaTier)] ?? KARMA_CONFIG.novice;
}
