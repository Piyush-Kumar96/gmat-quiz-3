import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { User, UserProfile } from '../types/auth';
import { login as authLogin, register as authRegister, logout as authLogout, getCurrentUser, isAuthenticated } from '../services/authService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, targetScore: number) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      if (isAuthenticated()) {
        try {
          const userProfile = await getCurrentUser();
          setProfile(userProfile);
          setUser({
            _id: userProfile._id,
            email: userProfile.email,
            fullName: userProfile.fullName,
            targetScore: userProfile.targetScore,
            createdAt: new Date().toISOString(), // This will be updated when we get the actual data
          });
        } catch (err) {
          console.error('Failed to load user profile', err);
          authLogout();
        }
      }
      setLoading(false);
    };

    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const { user } = await authLogin({ email, password });
      setUser(user);
      
      // Load profile data
      const userProfile = await getCurrentUser();
      setProfile(userProfile);
    } catch (err) {
      setError('Invalid email or password');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, fullName: string, targetScore: number) => {
    try {
      setLoading(true);
      setError(null);
      const { user } = await authRegister({ email, password, fullName, targetScore });
      setUser(user);
      
      // Load profile data
      const userProfile = await getCurrentUser();
      setProfile(userProfile);
    } catch (err) {
      setError('Registration failed. Email may already be in use.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authLogout();
    setUser(null);
    setProfile(null);
  };

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    profile,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 