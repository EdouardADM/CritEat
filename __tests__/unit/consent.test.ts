// On mock le client Supabase pour éviter la chaîne d'import native (secure-store).
jest.mock("../../lib/supabase", () => ({ supabase: {} }));

import { hasValidConsent } from "../../context/AuthContext";
import { CONSENT_VERSION } from "../../constants/legal";

const userWith = (meta: Record<string, unknown>) =>
  ({ user_metadata: meta } as any);

describe("hasValidConsent", () => {
  it("est vrai quand le consentement est présent et à la version courante", () => {
    const user = userWith({
      consent_accepted_at: "2026-05-30T10:00:00.000Z",
      consent_version: CONSENT_VERSION,
    });
    expect(hasValidConsent(user)).toBe(true);
  });

  it("est faux si le consentement n'a jamais été donné", () => {
    expect(hasValidConsent(userWith({}))).toBe(false);
    expect(hasValidConsent(userWith({ consent_version: CONSENT_VERSION }))).toBe(false);
  });

  it("est faux si la version acceptée est périmée", () => {
    const user = userWith({
      consent_accepted_at: "2026-05-30T10:00:00.000Z",
      consent_version: "0.9",
    });
    expect(hasValidConsent(user)).toBe(false);
  });

  it("est faux si l'utilisateur est null", () => {
    expect(hasValidConsent(null)).toBe(false);
  });
});
