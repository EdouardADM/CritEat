// Faux SecureStore en mémoire pour isoler l'adaptateur de la couche native.
const memStore: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
  getItemAsync: jest.fn(async (k: string) => (k in memStore ? memStore[k] : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    memStore[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete memStore[k];
  }),
}));

import { secureStoreAdapter } from "../../lib/secureStoreAdapter";

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k];
});

describe("secureStoreAdapter (découpage chiffré)", () => {
  it("fait un aller-retour correct sur une petite valeur", async () => {
    await secureStoreAdapter.setItem("k", "petite-valeur");
    expect(await secureStoreAdapter.getItem("k")).toBe("petite-valeur");
  });

  it("renvoie null pour une clé absente", async () => {
    expect(await secureStoreAdapter.getItem("inexistante")).toBeNull();
  });

  it("découpe puis réassemble exactement une grande valeur (> 2048 octets)", async () => {
    const big = "a".repeat(6000); // > 2 morceaux de 2000
    await secureStoreAdapter.setItem("session", big);

    // Plusieurs morceaux ont bien été créés (pas une seule entrée tronquée).
    expect(Number(memStore["session__n"])).toBeGreaterThan(1);

    const restored = await secureStoreAdapter.getItem("session");
    expect(restored).toBe(big);
    expect(restored?.length).toBe(6000);
  });

  it("supprime tous les morceaux avec removeItem", async () => {
    await secureStoreAdapter.setItem("session", "x".repeat(5000));
    await secureStoreAdapter.removeItem("session");

    expect(await secureStoreAdapter.getItem("session")).toBeNull();
    // Aucun résidu de morceau dans le coffre.
    expect(Object.keys(memStore).filter((k) => k.startsWith("session"))).toHaveLength(0);
  });

  it("nettoie les morceaux résiduels quand la nouvelle valeur est plus courte", async () => {
    await secureStoreAdapter.setItem("session", "y".repeat(6000)); // 3 morceaux
    await secureStoreAdapter.setItem("session", "court"); // 1 morceau

    expect(await secureStoreAdapter.getItem("session")).toBe("court");
    expect(memStore["session__chunk_1"]).toBeUndefined();
    expect(memStore["session__chunk_2"]).toBeUndefined();
  });
});
