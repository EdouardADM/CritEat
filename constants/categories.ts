export type RestaurantCategory =
  | "french" | "italian" | "japanese" | "chinese" | "american"
  | "mexican" | "indian" | "thai" | "mediterranean" | "fast_food"
  | "cafe" | "bakery" | "seafood" | "vegetarian" | "other";

export type CategoryConfig = {
  color: string;
  emoji: string;
  label: string;
};

export const CATEGORY_CONFIG: Record<RestaurantCategory, CategoryConfig> = {
  french:         { color: "#2563EB", emoji: "🇫🇷", label: "Français" },
  italian:        { color: "#16A34A", emoji: "🇮🇹", label: "Italien" },
  japanese:       { color: "#DC2626", emoji: "🇯🇵", label: "Japonais" },
  chinese:        { color: "#EA580C", emoji: "🐉", label: "Chinois" },
  american:       { color: "#7C3AED", emoji: "🍔", label: "Américain" },
  mexican:        { color: "#B45309", emoji: "🌮", label: "Mexicain" },
  indian:         { color: "#D97706", emoji: "🍛", label: "Indien" },
  thai:           { color: "#0891B2", emoji: "🌿", label: "Thaïlandais" },
  mediterranean:  { color: "#0284C7", emoji: "🌊", label: "Méditerranéen" },
  fast_food:      { color: "#F59E0B", emoji: "🍟", label: "Fast-food" },
  cafe:           { color: "#92400E", emoji: "☕", label: "Café" },
  bakery:         { color: "#CA8A04", emoji: "🥐", label: "Boulangerie" },
  seafood:        { color: "#0E7490", emoji: "🦞", label: "Fruits de mer" },
  vegetarian:     { color: "#65A30D", emoji: "🥗", label: "Végétarien" },
  other:          { color: "#6B7280", emoji: "🍽️", label: "Restaurant" },
};

export function getCategoryConfig(category: string): CategoryConfig {
  return CATEGORY_CONFIG[category as RestaurantCategory] ?? CATEGORY_CONFIG.other;
}
