import React from "react";
import { renderHook, act } from "@testing-library/react-native";

// jest.fn() définis DANS la factory puis récupérés via l'import mocké.
jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      updateUser: jest.fn(),
      verifyOtp: jest.fn(),
      resend: jest.fn(),
    },
  },
}));

import { supabase } from "../../lib/supabase";
import { AuthProvider, useAuth } from "../../context/AuthContext";
import { CONSENT_VERSION } from "../../constants/legal";

const auth = supabase.auth as any;

beforeEach(() => {
  jest.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.resend.mockResolvedValue({ error: null });
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(AuthProvider, null, children);

describe("Consentement & OTP (AuthContext)", () => {
  it("recordConsent enregistre l'horodatage + la version courante", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.recordConsent();
    });

    expect(auth.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consent_version: CONSENT_VERSION,
        consent_accepted_at: expect.any(String),
        consent_withdrawn_at: null,
      }),
    });
  });

  it("withdrawConsent efface l'acceptation (consent_accepted_at = null)", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.withdrawConsent();
    });

    expect(auth.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consent_accepted_at: null,
        consent_withdrawn_at: expect.any(String),
      }),
    });
  });

  it("verifyOtp transmet le type 'email_change' au serveur", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.verifyOtp("nouveau@mail.com", "123456", "email_change");
    });

    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "nouveau@mail.com",
      token: "123456",
      type: "email_change",
    });
  });

  it("verifySignupOtp utilise le type 'signup' par défaut", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.verifySignupOtp("a@b.com", "000000");
    });

    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "a@b.com",
      token: "000000",
      type: "signup",
    });
  });
});
