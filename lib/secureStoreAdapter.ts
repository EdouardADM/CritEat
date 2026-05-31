import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupportedStorage } from "@supabase/supabase-js";

// ── Adaptateur de stockage sécurisé pour Supabase ──────────────────────────────
//
// La session Supabase (jeton d'accès + refresh) est persistée dans le coffre
// chiffré de l'OS (Keychain iOS / Keystore Android) via expo-secure-store, et
// JAMAIS en clair.
//
// expo-secure-store limite chaque entrée à ~2048 octets. La session peut
// dépasser cette taille → on découpe la valeur en morceaux et on la réassemble,
// pour éviter toute troncature silencieuse.
//
// Sur le web (react-native-web), SecureStore n'existe pas → on délègue à
// AsyncStorage. Le coffre chiffré reste la règle sur natif.
//
// IMPORTANT : ce module ne journalise jamais clés ni valeurs (jetons sensibles).

const CHUNK_SIZE = 2000; // marge sous la limite ~2048 o (jetons base64 = ASCII)

// Clés dérivées pour le découpage.
const countKey = (key: string) => `${key}__n`;
const chunkKey = (key: string, i: number) => `${key}__chunk_${i}`;

const isWeb = Platform.OS === "web";

// Options iOS : permet la lecture/refresh du token quand l'app se réveille en
// arrière-plan (sinon l'auto-refresh échoue tant que l'appareil est verrouillé).
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function getChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key), secureOptions);
  if (raw == null) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function removeChunks(key: string, fromIndex: number, count: number): Promise<void> {
  const deletions: Promise<void>[] = [];
  for (let i = fromIndex; i < count; i++) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i), secureOptions));
  }
  await Promise.all(deletions);
}

export const secureStoreAdapter: SupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return AsyncStorage.getItem(key);

    const count = await getChunkCount(key);
    if (count === 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i), secureOptions);
      // Un morceau manquant signifie une entrée corrompue → on n'en renvoie pas
      // une version tronquée silencieusement.
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) return AsyncStorage.setItem(key, value);

    // Découpe la valeur en morceaux de CHUNK_SIZE caractères.
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    // Cas d'une chaîne vide : on garde au moins un morceau vide cohérent.
    if (chunks.length === 0) chunks.push("");

    const previousCount = await getChunkCount(key);

    // Écrit les nouveaux morceaux puis le compteur.
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i], secureOptions);
    }
    await SecureStore.setItemAsync(countKey(key), String(chunks.length), secureOptions);

    // Supprime les morceaux résiduels d'une valeur précédente plus longue.
    if (previousCount > chunks.length) {
      await removeChunks(key, chunks.length, previousCount);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) return AsyncStorage.removeItem(key);

    const count = await getChunkCount(key);
    await removeChunks(key, 0, count);
    await SecureStore.deleteItemAsync(countKey(key), secureOptions);
  },
};
