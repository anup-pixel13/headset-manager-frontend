import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';

const AuthContext = createContext(null);

// ============================================
// CONSTANTS (matches main site)
// ============================================
const SESSION_CHECK_INTERVAL = 60 * 1000;        // every 1 minute
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;       // 30 minutes
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const SESSION_KEY = 'hs_session_token';

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiring, setSessionExpiring] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const sessionCheckIntervalRef = useRef(null);

  // ============================================
  // TOKEN HELPERS
  // ============================================
  const getSessionToken = useCallback(() => sessionStorage.getItem(SESSION_KEY), []);

  const setSessionToken = (token) => {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
  };

  // ============================================
  // SESSION EXPIRED HANDLER
  // ============================================
  const handleSessionExpired = useCallback((reason = 'expired') => {
    setSessionToken(null);
    setIsAuthenticated(false);
    setUser(null);
    setSessionExpiring(false);

    if (sessionCheckIntervalRef.current) {
      clearInterval(sessionCheckIntervalRef.current);
    }

    if (reason === 'inactivity' && window.location.pathname !== '/login') {
      alert('Your session has expired due to inactivity. Please login again.');
      window.location.href = '/login';
    }
  }, []);

  // ============================================
  // VERIFY SESSION
  // ============================================
  const verifySession = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setIsAuthenticated(false);
      setUser(null);
      setLoading(false);
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/verify-session`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': token }
      });

      const result = await res.json();

      if (result?.success && result?.isAuthenticated) {
        setIsAuthenticated(true);
        setUser(result.data.user);
       // setSessionExpiring(false);
        return true;
      }

      handleSessionExpired(result?.reason || 'expired');
      return false;
    } catch (err) {
      console.error('Session verification error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [getSessionToken, handleSessionExpired]);

  // ============================================
  // REFRESH SESSION
  // ============================================
  const refreshSession = useCallback(async () => {
    const token = getSessionToken();
    if (!token) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': token }
      });

      const result = await res.json();
      if (result?.success) {
        lastActivityRef.current = Date.now();
        setSessionExpiring(false);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Session refresh error:', err);
      return false;
    }
  }, [getSessionToken]);

  // ============================================
  // ACTIVITY TRACKING
  // ============================================
  const handleUserActivity = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityRef.current;

    if (timeSinceLastActivity > 60 * 1000 && isAuthenticated) {
      lastActivityRef.current = now;
      refreshSession();
    }
  }, [isAuthenticated, refreshSession]);

  const checkInactivity = useCallback(() => {
    if (!isAuthenticated) return;

    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityRef.current;

    if (timeSinceLastActivity > INACTIVITY_TIMEOUT - 5 * 60 * 1000 && !sessionExpiring) {
      setSessionExpiring(true);
    }

    if (timeSinceLastActivity > INACTIVITY_TIMEOUT) {
      handleSessionExpired('inactivity');
    }
  }, [isAuthenticated, sessionExpiring, handleSessionExpired]);

  // ============================================
  // LOGIN
  // ============================================
  const login = async (username, password) => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();

      if (result?.success) {
        const data = result.data || {};
        setSessionToken(data.sessionToken);
        setIsAuthenticated(true);
        setUser(data.user);
        lastActivityRef.current = Date.now();
        return { success: true };
      }
      return { success: false, message: result?.message || 'Login failed' };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, message: 'Login failed. Please check your connection.' };
    }
  };

  // ============================================
  // LOGOUT
  // ============================================
  const logout = async () => {
    const token = getSessionToken();
    try {
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Token': token }
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setSessionToken(null);
      setIsAuthenticated(false);
      setUser(null);
      if (sessionCheckIntervalRef.current) clearInterval(sessionCheckIntervalRef.current);
    }
  };

  // ============================================
  // EXTEND SESSION (used by modal)
  // ============================================
  const extendSession = async () => {
    const success = await refreshSession();
    if (success) {
      setSessionExpiring(false);
      lastActivityRef.current = Date.now();
    }
    return success;
  };

  // ============================================
  // INITIALIZE
  // ============================================
  useEffect(() => {
    verifySession();
  }, [verifySession]);

  // ============================================
  // ACTIVITY LISTENERS + INTERVAL
  // ============================================
  useEffect(() => {
    if (!isAuthenticated) return;

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, handleUserActivity, { passive: true })
    );

    sessionCheckIntervalRef.current = setInterval(() => {
      verifySession();
      checkInactivity();
    }, SESSION_CHECK_INTERVAL);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleUserActivity));
      if (sessionCheckIntervalRef.current) clearInterval(sessionCheckIntervalRef.current);
    };
  }, [isAuthenticated, handleUserActivity, verifySession, checkInactivity]);

  // ============================================
  // TAB VISIBILITY
  // ============================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        verifySession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, verifySession]);

  // ============================================
  // ROLE HELPERS
  // ============================================
  const role = user?.role || null;
  const hasRole = (...roles) => !!user && roles.includes(user.role);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        role,
        loading,
        sessionExpiring,
        login,
        logout,
        extendSession,
        verifySession,
        getSessionToken,
        isAdmin: hasRole('admin'),
        isManager: hasRole('manager'),
        isTL: hasRole('tl'),
        isITStaff: hasRole('it_staff', 'it_staff'),
        isAgent: hasRole('agent'),
        isTrainer: hasRole('trainer')
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export default AuthContext;