import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { CONSENT_VERSION } from "../constants/legal";

export type OtpType = "signup" | "email_change";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Confirmation par code OTP (inscription ou changement d'email)
  verifyOtp: (email: string, token: string, type?: OtpType) => Promise<void>;
  resendCode: (email: string, type?: OtpType) => Promise<void>;
  // Alias rétro-compatibles (inscription)
  verifySignupOtp: (email: string, token: string) => Promise<void>;
  resendSignupCode: (email: string) => Promise<void>;
  // Consentement RGPD
  recordConsent: () => Promise<void>;
  withdrawConsent: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Vrai si l'utilisateur a accepté la version courante de la politique.
export function hasValidConsent(user: User | null): boolean {
  if (!user) return false;
  const meta = user.user_metadata ?? {};
  return (
    !!meta.consent_accepted_at && meta.consent_version === CONSENT_VERSION
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Récupère la session persistée au démarrage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Écoute les changements d'état d'authentification (login, logout, refresh token…)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    username: string
  ): Promise<void> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // username + consentement horodaté transmis dans raw_user_meta_data.
        // (register n'appelle signUp qu'après acceptation de la case obligatoire.)
        data: {
          username,
          consent_accepted_at: new Date().toISOString(),
          consent_version: CONSENT_VERSION,
        },
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  // Vérifie un code OTP côté serveur. En cas de succès, onAuthStateChange pose
  // la session → la redirection est gérée par _layout.tsx.
  const verifyOtp = async (
    email: string,
    token: string,
    type: OtpType = "signup"
  ): Promise<void> => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type });
    if (error) throw error;
  };

  // Renvoie un nouveau code (rate limité côté serveur).
  const resendCode = async (
    email: string,
    type: OtpType = "signup"
  ): Promise<void> => {
    const { error } = await supabase.auth.resend({ type, email });
    if (error) throw error;
  };

  const verifySignupOtp = (email: string, token: string) =>
    verifyOtp(email, token, "signup");
  const resendSignupCode = (email: string) => resendCode(email, "signup");

  // Enregistre/rafraîchit le consentement (case cochée à la connexion ou ré-acceptation).
  const recordConsent = async (): Promise<void> => {
    const { error } = await supabase.auth.updateUser({
      data: {
        consent_accepted_at: new Date().toISOString(),
        consent_version: CONSENT_VERSION,
        consent_withdrawn_at: null,
      },
    });
    if (error) throw error;
  };

  // Retire le consentement (les données sont conservées ; l'appelant déconnecte ensuite).
  const withdrawConsent = async (): Promise<void> => {
    const { error } = await supabase.auth.updateUser({
      data: {
        consent_accepted_at: null,
        consent_withdrawn_at: new Date().toISOString(),
      },
    });
    if (error) throw error;
  };

  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        verifyOtp,
        resendCode,
        verifySignupOtp,
        resendSignupCode,
        recordConsent,
        withdrawConsent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Hook à utiliser dans tous les écrans qui ont besoin de l'auth */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
