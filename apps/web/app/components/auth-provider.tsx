"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  fetchOnboardingStatus,
  fetchMe,
  loginRequest,
  logoutRequest,
  registerRequest
} from "../lib/api";
import type { AuthUser } from "../lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  onboardingCompleted: boolean;
  onboardingLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshOnboarding: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(true);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await fetchMe();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const refreshOnboarding = useCallback(async () => {
    if (!user) {
      setOnboardingCompleted(false);
      setOnboardingLoading(false);
      return;
    }
    setOnboardingLoading(true);
    try {
      const completed = await fetchOnboardingStatus();
      setOnboardingCompleted(completed);
    } catch {
      setOnboardingCompleted(false);
    } finally {
      setOnboardingLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading) {
      refreshOnboarding();
    }
  }, [loading, refreshOnboarding]);

  const login = useCallback(
    async (email: string, password: string) => {
      await loginRequest(email, password);
      await loadUser();
      await refreshOnboarding();
    },
    [loadUser, refreshOnboarding]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await registerRequest(email, password);
      await loadUser();
      await refreshOnboarding();
    },
    [loadUser, refreshOnboarding]
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setOnboardingCompleted(false);
      setOnboardingLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      onboardingCompleted,
      onboardingLoading,
      login,
      register,
      logout,
      refreshOnboarding
    }),
    [
      user,
      loading,
      onboardingCompleted,
      onboardingLoading,
      login,
      register,
      logout,
      refreshOnboarding
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
