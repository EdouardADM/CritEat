import type { FeatureCollection, Feature, Point } from 'geojson';
import type { Restaurant } from '../hooks/useRestaurants';

export type RestaurantProperties = {
  id: string;
  place_id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  composite_score: number | null;
  popularity_score: number | null;
  review_count: number;
  /** Rang de popularité (1 = meilleur). Utilisé pour le filtrage progressif par zoom. */
  rank: number;
};

export type RestaurantFeatureCollection = FeatureCollection<Point, RestaurantProperties>;

export function restaurantsToGeoJSON(restaurants: Restaurant[]): RestaurantFeatureCollection {
  // Tri par composite_score desc, puis popularity_score desc, nulls en dernier.
  // Le rang est stable : un bon restaurant reste visible même à faible zoom.
  const sorted = [...restaurants].sort((a, b) => {
    const sa = a.composite_score ?? -1;
    const sb = b.composite_score ?? -1;
    if (sb !== sa) return sb - sa;
    return (b.popularity_score ?? 0) - (a.popularity_score ?? 0);
  });

  const features: Feature<Point, RestaurantProperties>[] = sorted.map((r, i) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [r.longitude, r.latitude],
    },
    properties: {
      id: r.id,
      place_id: r.place_id,
      name: r.name,
      category: r.category,
      address: r.address,
      city: r.city,
      composite_score: r.composite_score,
      popularity_score: r.popularity_score,
      review_count: r.review_count,
      rank: i + 1,
    },
  }));

  return { type: 'FeatureCollection', features };
}
