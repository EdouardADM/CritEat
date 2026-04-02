import type { RestaurantCategory } from "../constants/categories";

/**
 * Mappe les types Google Places vers l'enum restaurant_category de Supabase.
 * On reçoit un tableau de types (ex. ["restaurant", "italian_restaurant", "food"]).
 */
export function mapGoogleTypesToCategory(types: string[]): RestaurantCategory {
  const joined = types.join(" ");
  const has = (kw: string) => joined.includes(kw);

  if (has("french_restaurant"))                                          return "french";
  if (has("italian_restaurant") || has("pizza_restaurant"))             return "italian";
  if (has("japanese_restaurant") || has("sushi_restaurant") || has("ramen_restaurant"))
                                                                         return "japanese";
  if (has("chinese_restaurant"))                                         return "chinese";
  if (has("american_restaurant") || has("hamburger_restaurant"))        return "american";
  if (has("mexican_restaurant"))                                         return "mexican";
  if (has("indian_restaurant"))                                          return "indian";
  if (has("thai_restaurant"))                                            return "thai";
  if (
    has("mediterranean_restaurant") || has("greek_restaurant") ||
    has("turkish_restaurant")       || has("lebanese_restaurant")
  )                                                                      return "mediterranean";
  if (has("fast_food_restaurant"))                                       return "fast_food";
  if (has("cafe") || has("coffee_shop"))                                 return "cafe";
  if (has("bakery"))                                                     return "bakery";
  if (has("seafood_restaurant"))                                         return "seafood";
  if (has("vegetarian_restaurant") || has("vegan_restaurant"))          return "vegetarian";
  return "other";
}
