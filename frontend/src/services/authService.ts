import axios from 'axios';
import { LoginCredentials, RegisterCredentials, AuthResponse, UserProfile } from '../types/auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5006/api';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add auth token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Login user and get authentication token
 */
export const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  try {
    const response = await api.post('/auth/login', credentials);
    
    // Backend returns token and user directly
    const { token, user } = response.data;
    
    // Store token in localStorage
    localStorage.setItem('token', token);
    
    return { user, token };
  } catch (error: any) {
    console.error('Login error:', error);
    
    // Provide a more user-friendly error message
    if (error.response?.status === 401) {
      throw new Error('Invalid email or password');
    } else if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    } else {
      throw new Error('Failed to login. Please try again.');
    }
  }
};

/**
 * Register new user
 */
export const register = async (credentials: RegisterCredentials): Promise<AuthResponse> => {
  try {
    const response = await api.post('/auth/register', credentials);
    
    // Backend returns token and user directly
    const { token, user } = response.data;
    
    // Store token in localStorage
    localStorage.setItem('token', token);
    
    return { user, token };
  } catch (error: any) {
    console.error('Registration error:', error);
    
    // Provide a user-friendly error message
    if (error.response?.status === 400 && error.response?.data?.message) {
      throw new Error(error.response.data.message);
    } else if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    } else {
      throw new Error('Failed to register. Please try again.');
    }
  }
};

/**
 * Logout user - simply clear token from localStorage
 */
export const logout = (): void => {
  localStorage.removeItem('token');
};

/**
 * Get current authenticated user profile
 */
export const getCurrentUser = async (): Promise<UserProfile> => {
  try {
    const response = await api.get('/auth/profile');
    
    // Backend returns user and stats directly
    return {
      user: response.data.user,
      stats: response.data.stats
    };
  } catch (error: any) {
    console.error('Get user profile error:', error);
    
    if (error.response?.status === 401) {
      // Handle unauthorized access - clear token
      localStorage.removeItem('token');
      throw new Error('Your session has expired. Please login again.');
    } else if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    } else {
      throw new Error('Failed to fetch profile. Please try again.');
    }
  }
};

/**
 * Check if user is authenticated (token exists)
 */
export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('token');
}; 