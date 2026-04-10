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
};

export type RestaurantFeatureCollection = FeatureCollection<Point, RestaurantProperties>;

export function restaurantsToGeoJSON(restaurants: Restaurant[]): RestaurantFeatureCollection {
  const features: Feature<Point, RestaurantProperties>[] = restaurants.map((r) => ({
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
    },
  }));

  return { type: 'FeatureCollection', features };
}
