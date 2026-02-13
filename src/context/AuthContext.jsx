import { createContext, useContext, useState, useEffect } from 'react';
import { supabase, getSession, onAuthStateChange, signInWithGoogle, signOut, signOutLocal, clearLocalAuthTokens } from '../services/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Check current session on mount
    getSession()
      .then(async ({ session, error }) => {
        if (error) {
          console.error('Auth session error:', error);
          // Clear stale local tokens — use direct localStorage clear as fallback
          // since signOutLocal itself will fail if Supabase is unreachable
          await signOutLocal().catch(() => clearLocalAuthTokens());
          setUser(null);
          return;
        }
        setUser(session?.user || null);
      })
      .catch(async (err) => {
        console.error('Auth session check failed:', err);
        // Supabase is unreachable — clear tokens directly from localStorage
        // to stop the client from endlessly retrying token refresh
        clearLocalAuthTokens();
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange((user) => {
      setUser(user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async () => {
    setAuthError(null);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        console.error('Login error:', error);
        throw error;
      }
    } catch (err) {
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        const friendlyError = new Error('Unable to reach the authentication server. The Supabase project may be paused or your internet connection may be down.');
        setAuthError(friendlyError.message);
        throw friendlyError;
      }
      setAuthError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    const { error } = await signOut();
    if (error) {
      console.error('Logout error:', error);
      throw error;
    }
    setUser(null);
  };

  const value = {
    user,
    loading,
    authError,
    login,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
