// TODO (production) : déplacer cet appel dans une Supabase Edge Function
// pour ne jamais exposer la clé Google côté client.

export type GoogleAddressComponent = {
  longText: string;
  shortText: string;
  types: string[];
  languageCode: string;
};

export type GooglePlace = {
  id: string;
  displayName: { text: string; languageCode: string };
  types: string[];
  formattedAddress: string;
  addressComponents?: GoogleAddressComponent[];
  location: { latitude: number; longitude: number };
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions: string[] };
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.regularOpeningHours",
].join(",");

export async function searchGooglePlaces(
  query: string,
  userLat: number,
  userLng: number,
): Promise<GooglePlace[]> {
  // La clé est exposée côté client (acceptable pour un TFE).
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${query} restaurant`,
        locationBias: {
          circle: {
            center: { latitude: userLat, longitude: userLng },
            radius: 15000,
          },
        },
        maxResultCount: 5,
      }),
    });

    if (!res.ok) return [];
    const json = (await res.json()) as { places?: GooglePlace[] };
    return json.places ?? [];
  } catch {
    return [];
  }
}
