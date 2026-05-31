import { getKarma, KARMA_CONFIG } from "../../constants/karma";

// Test unitaire : la résolution d'un palier de Karma est une fonction pure.
describe("getKarma", () => {
  it("renvoie la configuration exacte de chaque palier connu", () => {
    expect(getKarma("novice")).toEqual(KARMA_CONFIG.novice);
    expect(getKarma("confirmed_critic")).toEqual(KARMA_CONFIG.confirmed_critic);
    expect(getKarma("local_expert")).toEqual(KARMA_CONFIG.local_expert);
  });

  it("expose les libellés français attendus", () => {
    expect(getKarma("novice").label).toBe("Novice");
    expect(getKarma("confirmed_critic").label).toBe("Critique confirmé");
    expect(getKarma("local_expert").label).toBe("Expert local");
  });

  it("retombe sur 'Novice' pour une valeur inconnue, nulle ou indéfinie", () => {
    expect(getKarma("valeur_inexistante")).toEqual(KARMA_CONFIG.novice);
    expect(getKarma(null)).toEqual(KARMA_CONFIG.novice);
    expect(getKarma(undefined)).toEqual(KARMA_CONFIG.novice);
    expect(getKarma("")).toEqual(KARMA_CONFIG.novice);
  });
});
