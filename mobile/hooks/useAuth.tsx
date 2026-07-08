/**
 * useAuth() — the React hook every screen uses to read + drive auth
 * state. Backed by lib/auth.ts's subscribe() pub/sub, wrapped in a
 * Context so React can memoize the value across renders.
 *
 * Wrap the root layout with <AuthProvider> (see app/_layout.tsx).
 *
 *   const {
 *     user, isSignedIn, isLoading,
 *     signInWithApple, signInWithGoogle, signOut,
 *   } = useAuth();
 *
 * `isLoading` is true only during the initial SecureStore hydration
 * pass and while a sign-in / refresh call is in flight. Once the app
 * has hydrated with no token, `isLoading` is false and `isSignedIn`
 * is false — the tabs layout guard then routes to /(auth)/sign-in.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AuthUser,
  getAuthState,
  hydrateAuth,
  refreshToken as libRefresh,
  signInWithApple as libSignInApple,
  signInWithGoogle as libSignInGoogle,
  signOut as libSignOut,
  subscribe,
} from '../lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(() => getAuthState());
  const [hydrating, setHydrating] = useState(true);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Kick off SecureStore hydration once. Subscribe first so we
    // don't miss the emit that hydrateAuth() fires when it finds a
    // stored token.
    const unsub = subscribe(next => {
      if (mounted.current) setState(next);
    });
    hydrateAuth().finally(() => {
      if (mounted.current) setHydrating(false);
    });
    return () => {
      mounted.current = false;
      unsub();
    };
  }, []);

  const wrap = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      setBusy(true);
      try {
        return await fn();
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    []
  );

  const signInWithApple = useCallback(
    () => wrap(() => libSignInApple()).then(() => undefined),
    [wrap]
  );
  const signInWithGoogle = useCallback(
    () => wrap(() => libSignInGoogle()).then(() => undefined),
    [wrap]
  );
  const signOut = useCallback(() => wrap(() => libSignOut()), [wrap]);
  const refresh = useCallback(() => wrap(() => libRefresh()), [wrap]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      isSignedIn: !!state.token && !!state.user,
      isLoading: hydrating || busy,
      signInWithApple,
      signInWithGoogle,
      signOut,
      refresh,
    }),
    [state, hydrating, busy, signInWithApple, signInWithGoogle, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
