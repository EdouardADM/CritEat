import { renderHook, act } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────────────
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

jest.mock("../../lib/supabase", () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));

import { supabase } from "../../lib/supabase";
import { secureStoreAdapter } from "../../lib/secureStoreAdapter";
import { useReviewVote } from "../../hooks/useReviewVote";
import { hasValidConsent } from "../../context/AuthContext";
import { CONSENT_VERSION } from "../../constants/legal";

const mockGetUser = supabase.auth.getUser as unknown as jest.Mock;
const mockFrom = supabase.from as unknown as jest.Mock;

describe("Sécurité", () => {
  // ── Intégrité du coffre chiffré ──────────────────────────────────────────
  it("stocke une session volumineuse sans troncature silencieuse", async () => {
    for (const k of Object.keys(memStore)) delete memStore[k];
    // Jeton de session réaliste > 2048 octets.
    const token = "h." + "Z".repeat(5000) + ".sig";

    await secureStoreAdapter.setItem("sb-auth-token", token);
    const restored = await secureStoreAdapter.getItem("sb-auth-token");

    expect(restored).toBe(token); // octet pour octet
    expect(restored?.length).toBe(token.length);
  });

  // ── Moindre privilège : le client n'écrit que dans `votes` ────────────────
  it("le vote n'écrit JAMAIS dans users/reviews (karma en lecture seule client)", async () => {
    const builder: any = {
      delete: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      upsert: jest.fn(() => Promise.resolve({ error: null })),
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    mockFrom.mockReturnValue(builder);
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { result } = renderHook(() => useReviewVote());
    await act(async () => {
      await result.current.toggleVote("r1", 1, null);
    });

    const tablesTouchees = mockFrom.mock.calls.map((c) => c[0]);
    expect(tablesTouchees).toContain("votes");
    expect(tablesTouchees).not.toContain("users");
    expect(tablesTouchees).not.toContain("reviews");
  });

  // ── Gating du consentement ────────────────────────────────────────────────
  it("refuse l'accès sans consentement valide", () => {
    expect(hasValidConsent(null)).toBe(false);
    expect(hasValidConsent({ user_metadata: {} } as any)).toBe(false);
    expect(
      hasValidConsent({
        user_metadata: { consent_accepted_at: "x", consent_version: "0.0" },
      } as any),
    ).toBe(false);
    expect(
      hasValidConsent({
        user_metadata: { consent_accepted_at: "x", consent_version: CONSENT_VERSION },
      } as any),
    ).toBe(true);
  });
});
