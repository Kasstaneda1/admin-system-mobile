// The session for the screens: whether the app shows sign in or the technician's screens, who
// is signed in, and what to say on the sign-in screen after the session ended (src/session).
//   status: 'loading' (reading the phone's store) | 'signedIn' | 'signedOut'
// Signed in, the app checks the session with GET /api/me at start and on return to the app (at
// most once per 5 minutes): a turned-off technician goes to sign in, a changed name shows.
// Without the network the check simply fails and the technician stays in.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { authAPI, session } from '../services/api';
import { NOTICE, checkDue, profileFromMe } from './model';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, notice: null });
  const lastCheck = useRef(null);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (!session.signedIn || checking.current) return;
    checking.current = true;
    lastCheck.current = Date.now();
    try {
      const me = await authAPI.me();
      if (!session.signedIn) return;
      const profile = profileFromMe(me, session.user);
      await session.updateUser(profile);
      setState((s) => (s.status === 'signedIn' ? { ...s, user: profile } : s));
    } catch {
      // No network or a server failure: stay in. A finished session has told the app already.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    const stopListening = session.onEnd((reason) => {
      checking.current = false; // a check cut off by the end never answers
      setState({ status: 'signedOut', user: null, notice: NOTICE[reason] || null });
    });
    let alive = true;
    session.load().then(
      (start) => {
        if (!alive) return;
        setState(start.signedIn
          ? { status: 'signedIn', user: start.user, notice: null }
          : { status: 'signedOut', user: null, notice: start.notice });
        if (start.signedIn) check();
      },
      () => { if (alive) setState({ status: 'signedOut', user: null, notice: null }); },
    );
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && checkDue(lastCheck.current, Date.now())) check();
    });
    return () => { alive = false; stopListening(); appState.remove(); };
  }, [check]);

  const signIn = useCallback(async (data) => {
    await session.signIn({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    checking.current = false;
    lastCheck.current = Date.now();
    setState({ status: 'signedIn', user: data.user, notice: null });
  }, []);

  const signOut = useCallback(async () => {
    checking.current = false;
    setState({ status: 'signedOut', user: null, notice: null });
    await session.signOut();
  }, []);

  const value = useMemo(() => ({ ...state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
